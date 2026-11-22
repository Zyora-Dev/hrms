from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Admin,
    Employee,
    PayrollRun,
    PayrollSettings,
    SalaryAdvance,
)
from app.routers.auth import current_admin
from app.schemas import (
    AdvanceEligibility,
    SalaryAdvanceAction,
    SalaryAdvanceCreate,
    SalaryAdvanceOut,
)

router = APIRouter(prefix="/advances", tags=["advances"])

ZERO = Decimal("0")
CENTS = Decimal("0.01")
LIVE = ("pending", "paid", "recovered")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def month_start(value: date) -> date:
    return value.replace(day=1)


def get_settings(db: Session) -> PayrollSettings:
    row = db.scalar(select(PayrollSettings).order_by(PayrollSettings.id).limit(1))
    if row is None:
        row = PayrollSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def monthly_salary(employee: Employee, settings: PayrollSettings) -> Decimal:
    """The month's salary an advance is drawn against."""
    gross = (
        Decimal(employee.ctc_annual) / Decimal(12) if employee.ctc_annual else ZERO
    )
    if settings.advance_basis == "basic":
        # Basic is a share of gross; without a structure lookup, half is the
        # conventional split and is what the seeded structure uses.
        return money(gross / Decimal(2))
    return money(gross)


def taken_in_period(
    db: Session, employee_id: int, period: date, exclude_id: int | None = None
) -> Decimal:
    stmt = select(func.coalesce(func.sum(SalaryAdvance.amount), 0)).where(
        SalaryAdvance.employee_id == employee_id,
        SalaryAdvance.period == period,
        SalaryAdvance.status.in_(LIVE),
    )
    if exclude_id is not None:
        stmt = stmt.where(SalaryAdvance.id != exclude_id)
    return Decimal(db.scalar(stmt) or 0)


def to_out(row: SalaryAdvance) -> SalaryAdvanceOut:
    out = SalaryAdvanceOut.model_validate(row)
    if row.employee:
        out.employee_name = row.employee.full_name
        out.employee_code = row.employee.employee_code
    basis = Decimal(row.salary_basis or 0)
    out.percent_of_salary = (
        money(Decimal(row.amount) * 100 / basis) if basis > ZERO else ZERO
    )
    return out


@router.get("/eligibility", response_model=AdvanceEligibility)
def eligibility(
    employee_id: int,
    period: date,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """How much of this month's salary is still available to draw early."""
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    settings_row = get_settings(db)
    month = month_start(period)
    salary = monthly_salary(employee, settings_row)

    ceiling = money(salary * Decimal(settings_row.advance_max_percent) / 100)
    taken = taken_in_period(db, employee_id, month)

    return AdvanceEligibility(
        employee_id=employee_id,
        period=month,
        monthly_salary=salary,
        basis=settings_row.advance_basis,
        default_percent=settings_row.advance_default_percent,
        max_percent=settings_row.advance_max_percent,
        max_amount=ceiling,
        already_taken=taken,
        available=max(ceiling - taken, ZERO),
    )


@router.get("", response_model=list[SalaryAdvanceOut])
def list_advances(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    period: date | None = None,
    employee_id: int | None = None,
    advance_status: str | None = Query(default=None, alias="status"),
):
    stmt = select(SalaryAdvance)
    if period:
        stmt = stmt.where(SalaryAdvance.period == month_start(period))
    if employee_id:
        stmt = stmt.where(SalaryAdvance.employee_id == employee_id)
    if advance_status:
        stmt = stmt.where(SalaryAdvance.status == advance_status)

    rows = db.scalars(
        stmt.order_by(SalaryAdvance.period.desc(), SalaryAdvance.id.desc())
    ).unique()
    return [to_out(r) for r in rows]


@router.post("", response_model=SalaryAdvanceOut, status_code=status.HTTP_201_CREATED)
def create_advance(
    payload: SalaryAdvanceCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    settings_row = get_settings(db)
    if not settings_row.advance_enabled:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Salary advances are turned off in settings"
        )

    employee = db.get(Employee, payload.employee_id)
    if not employee:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Employee not found")

    month = month_start(payload.period)
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == month))
    if run and run.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{month:%B %Y} payroll is already {run.status}.",
        )

    salary = monthly_salary(employee, settings_row)
    if salary <= ZERO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "This employee has no salary on file to draw against",
        )

    if payload.amount is not None and not settings_row.advance_allow_custom_amount:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Only a percentage may be used; custom amounts are turned off",
        )

    percent = payload.percent
    amount = (
        money(payload.amount)
        if payload.amount is not None
        else money(salary * Decimal(percent) / 100)
    )

    ceiling = money(salary * Decimal(settings_row.advance_max_percent) / 100)
    taken = taken_in_period(db, employee.id, month)
    if taken + amount > ceiling:
        available = max(ceiling - taken, ZERO)
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"That exceeds the {settings_row.advance_max_percent}% limit for "
            f"{month:%B %Y}. {available} still available.",
        )

    row = SalaryAdvance(
        employee_id=employee.id,
        period=month,
        percent=percent,
        amount=amount,
        salary_basis=salary,
        paid_on=payload.paid_on,
        payment_mode=payload.payment_mode,
        reference=payload.reference,
        note=payload.note,
        status="paid" if payload.paid_on else "pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row)


@router.post("/{advance_id}/actions", response_model=SalaryAdvanceOut)
def advance_action(
    advance_id: int,
    payload: SalaryAdvanceAction,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(SalaryAdvance, advance_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Advance not found")

    if row.status == "recovered":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Already recovered through payroll — reopen that run first.",
        )

    if payload.action == "mark_paid":
        # Reinstating a cancelled advance has to re-check the cap: cancelled
        # rows are excluded from the running total, so the slot may be gone.
        if row.status == "cancelled":
            settings_row = get_settings(db)
            employee = db.get(Employee, row.employee_id)
            ceiling = money(
                monthly_salary(employee, settings_row)
                * Decimal(settings_row.advance_max_percent)
                / 100
            )
            taken = taken_in_period(db, row.employee_id, row.period, exclude_id=row.id)
            if taken + Decimal(row.amount) > ceiling:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    f"Reinstating this would exceed the "
                    f"{settings_row.advance_max_percent}% limit for "
                    f"{row.period:%B %Y}.",
                )

        row.status = "paid"
        row.paid_on = payload.paid_on or date.today()
        if payload.reference:
            row.reference = payload.reference
    else:
        row.status = "cancelled"

    db.commit()
    db.refresh(row)
    return to_out(row)


@router.delete("/{advance_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_advance(
    advance_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(SalaryAdvance, advance_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Advance not found")
    if row.status == "recovered":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Already recovered through payroll — cancel it instead.",
        )
    db.delete(row)
    db.commit()

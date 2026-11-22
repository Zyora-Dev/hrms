from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import tds as fy
from app import forms
from app import letters as letters_engine
from app.db import get_db
from app.models import Admin, Company, Employee, PayrollRun, Payslip, TdsChallan
from app.routers.auth import current_admin
from app.schemas import (
    TdsChallanCreate,
    TdsChallanOut,
    TdsEmployeeRow,
    TdsMonthRow,
    TdsReconciliation,
)

router = APIRouter(prefix="/tds", tags=["tds"])

ZERO = Decimal("0")


def to_out(row: TdsChallan) -> TdsChallanOut:
    out = TdsChallanOut.model_validate(row)
    out.cin = f"{row.bsr_code}{row.deposit_date:%d%m%Y}{row.challan_serial}"
    fy = fy.financial_year(row.period)
    out.financial_year = fy.fy_label(fy)
    out.quarter = fy.quarter(row.period)
    out.due_date = fy.deposit_due_date(row.period)
    out.is_late = row.deposit_date > out.due_date
    return out


def recalc_total(row: TdsChallan) -> None:
    row.total_amount = (
        Decimal(row.tds_amount)
        + Decimal(row.surcharge)
        + Decimal(row.education_cess)
        + Decimal(row.interest)
        + Decimal(row.late_fee)
    )


def deducted_by_month(
    db: Session, start: date, end: date
) -> dict[date, tuple[Decimal, int]]:
    """TDS taken from payslips, from the line coded TDS.

    Payroll has no tax engine yet, so this reads whatever the salary structure
    or a payroll input put on the payslip under that code.
    """
    out: dict[date, tuple[Decimal, int]] = {}

    rows = db.execute(
        select(Payslip, PayrollRun.period)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(PayrollRun.period >= start, PayrollRun.period <= end)
    ).all()

    for slip, period in rows:
        amount = ZERO
        for line in slip.deductions or []:
            if str(line.get("code", "")).upper() == fy.TDS_CODE:
                amount += Decimal(str(line.get("amount", "0")))
        if amount <= ZERO:
            continue
        total, count = out.get(period, (ZERO, 0))
        out[period] = (total + amount, count + 1)

    return out


def deposited_by_month(db: Session, start: date, end: date) -> dict[date, tuple[Decimal, int]]:
    rows = db.execute(
        select(
            TdsChallan.period,
            func.coalesce(func.sum(TdsChallan.tds_amount), 0),
            func.count(),
        )
        .where(TdsChallan.period >= start, TdsChallan.period <= end)
        .group_by(TdsChallan.period)
    ).all()
    return {r[0]: (Decimal(r[1]), r[2]) for r in rows}


@router.get("/challans", response_model=list[TdsChallanOut])
def list_challans(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    quarter: int | None = Query(default=None, ge=1, le=4),
    date_from: date | None = None,
    date_to: date | None = None,
):
    stmt = select(TdsChallan)

    if financial_year is not None:
        if quarter:
            lo, hi = fy.quarter_months(financial_year, quarter)
        else:
            lo, hi = fy.fy_bounds(financial_year)
        stmt = stmt.where(TdsChallan.period >= lo, TdsChallan.period <= hi)
    if date_from:
        stmt = stmt.where(TdsChallan.period >= date_from)
    if date_to:
        stmt = stmt.where(TdsChallan.period <= date_to)

    rows = db.scalars(stmt.order_by(TdsChallan.period.desc(), TdsChallan.id.desc()))
    return [to_out(r) for r in rows]


@router.post("/challans", response_model=TdsChallanOut, status_code=status.HTTP_201_CREATED)
def create_challan(
    payload: TdsChallanCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    clash = db.scalar(
        select(TdsChallan).where(
            TdsChallan.bsr_code == payload.bsr_code,
            TdsChallan.deposit_date == payload.deposit_date,
            TdsChallan.challan_serial == payload.challan_serial,
        )
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "That CIN is already recorded — a challan cannot be entered twice.",
        )

    data = payload.model_dump()
    data["period"] = data["period"].replace(day=1)
    row = TdsChallan(**data)
    recalc_total(row)

    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row)


@router.put("/challans/{challan_id}", response_model=TdsChallanOut)
def update_challan(
    challan_id: int,
    payload: TdsChallanCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(TdsChallan, challan_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Challan not found")

    clash = db.scalar(
        select(TdsChallan).where(
            TdsChallan.id != challan_id,
            TdsChallan.bsr_code == payload.bsr_code,
            TdsChallan.deposit_date == payload.deposit_date,
            TdsChallan.challan_serial == payload.challan_serial,
        )
    )
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "That CIN is already recorded")

    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    row.period = row.period.replace(day=1)
    recalc_total(row)

    db.commit()
    db.refresh(row)
    return to_out(row)


@router.delete("/challans/{challan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_challan(
    challan_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(TdsChallan, challan_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Challan not found")
    db.delete(row)
    db.commit()


@router.get("/reconciliation", response_model=TdsReconciliation)
def reconciliation(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    quarter: int | None = Query(default=None, ge=1, le=4),
):
    """Deducted from payslips versus deposited by challan, month by month."""
    fy = financial_year if financial_year is not None else fy.financial_year(
        date.today()
    )
    if quarter:
        start, end = fy.quarter_months(fy, quarter)
    else:
        start, end = fy.fy_bounds(fy)

    deducted = deducted_by_month(db, start, end)
    deposited = deposited_by_month(db, start, end)

    months: list[TdsMonthRow] = []
    cursor = start.replace(day=1)
    while cursor <= end:
        taken, employees = deducted.get(cursor, (ZERO, 0))
        paid, challans = deposited.get(cursor, (ZERO, 0))
        difference = paid - taken
        due = fy.deposit_due_date(cursor)

        if taken == ZERO and paid == ZERO:
            state = "nothing_due"
        elif paid == ZERO:
            state = "not_deposited"
        elif difference == ZERO:
            state = "matched"
        elif difference < ZERO:
            state = "short"
        else:
            state = "excess"

        latest_deposit = db.scalar(
            select(func.max(TdsChallan.deposit_date)).where(TdsChallan.period == cursor)
        )

        months.append(
            TdsMonthRow(
                period=cursor,
                deducted=taken,
                deposited=paid,
                difference=difference,
                employees=employees,
                challans=challans,
                due_date=due,
                is_late=bool(latest_deposit and latest_deposit > due),
                status=state,
            )
        )
        cursor = (
            cursor.replace(year=cursor.year + 1, month=1)
            if cursor.month == 12
            else cursor.replace(month=cursor.month + 1)
        )

    total_deducted = sum((m.deducted for m in months), ZERO)
    total_deposited = sum((m.deposited for m in months), ZERO)

    return TdsReconciliation(
        financial_year=fy.fy_label(fy),
        quarter=quarter,
        return_due_date=fy.return_due_date(fy, quarter) if quarter else None,
        total_deducted=total_deducted,
        total_deposited=total_deposited,
        difference=total_deposited - total_deducted,
        months=months,
    )


@router.get("/deductees", response_model=list[TdsEmployeeRow])
def deductees(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    quarter: int | None = Query(default=None, ge=1, le=4),
):
    """Per-employee TDS for the period — the deductee list a return needs."""
    fy = financial_year if financial_year is not None else fy.financial_year(
        date.today()
    )
    start, end = (
        fy.quarter_months(fy, quarter) if quarter else fy.fy_bounds(fy)
    )

    rows = db.execute(
        select(Payslip, Employee)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .join(Employee, Payslip.employee_id == Employee.id)
        .where(PayrollRun.period >= start, PayrollRun.period <= end)
    ).all()

    totals: dict[int, dict] = {}
    for slip, employee in rows:
        amount = ZERO
        for line in slip.deductions or []:
            if str(line.get("code", "")).upper() == fy.TDS_CODE:
                amount += Decimal(str(line.get("amount", "0")))
        if amount <= ZERO:
            continue

        entry = totals.setdefault(
            employee.id,
            {"employee": employee, "amount": ZERO, "months": 0},
        )
        entry["amount"] += amount
        entry["months"] += 1

    return [
        TdsEmployeeRow(
            employee_id=e["employee"].id,
            employee_name=e["employee"].full_name,
            employee_code=e["employee"].employee_code,
            pan=e["employee"].pan,
            amount=e["amount"],
            months=e["months"],
        )
        for e in sorted(totals.values(), key=lambda x: x["employee"].employee_code)
    ]


@router.get("/form138")
def form138(
    financial_year: int,
    quarter: int = Query(ge=1, le=4),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """The quarter's return, as a PDF ready to check before filing."""
    start, end = fy.quarter_months(financial_year, quarter)
    company = db.scalar(select(Company).order_by(Company.id).limit(1))

    form = forms.Form138(company, financial_year, quarter, start, end)

    for challan in db.scalars(
        select(TdsChallan)
        .where(TdsChallan.period >= start, TdsChallan.period <= end)
        .order_by(TdsChallan.deposit_date)
    ):
        form.add_challan(challan)

    # Only runs that were actually approved: a draft is not a deduction.
    slips = db.scalars(
        select(Payslip)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(
            PayrollRun.status.in_(("approved", "paid")),
            PayrollRun.period >= start,
            PayrollRun.period <= end,
        )
    ).unique()

    gathered: dict[int, dict] = {}
    for slip in slips:
        bucket = gathered.setdefault(
            slip.employee_id,
            {"employee": slip.employee, "paid": ZERO, "deducted": ZERO, "months": 0},
        )
        bucket["paid"] += Decimal(str(slip.gross_pay or 0))
        bucket["months"] += 1
        bucket["deducted"] += sum(
            (
                Decimal(str(line.get("amount", 0)))
                for line in (slip.deductions or [])
                if str(line.get("code", "")).upper() == fy.TDS_CODE
            ),
            ZERO,
        )

    for bucket in sorted(
        gathered.values(),
        key=lambda b: (b["employee"].employee_code if b["employee"] else ""),
    ):
        if bucket["employee"] is None:
            continue
        form.add_row(
            bucket["employee"], bucket["paid"], bucket["deducted"], bucket["months"]
        )

    pdf = letters_engine.to_pdf(forms.render_138(form))
    filename = f"form138-{forms.fy_label(financial_year)}-Q{quarter}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import loans as engine
from app.db import get_db
from app.models import Admin, Employee, EmployeeLoan, LoanInstalment
from app.routers.auth import current_admin
from app.schemas import (
    LoanAction,
    LoanCreate,
    LoanDetail,
    LoanInstalmentOut,
    LoanOut,
)

router = APIRouter(prefix="/loans", tags=["loans"])

ZERO = Decimal("0")
OPEN = ("pending",)


def next_reference(db: Session) -> str:
    latest = db.scalar(
        select(EmployeeLoan.reference).order_by(EmployeeLoan.id.desc()).limit(1)
    )
    n = int(latest.split("-")[1]) + 1 if latest and "-" in latest else 1
    return f"LN-{n:04d}"


def to_out(loan: EmployeeLoan, detail: bool = False) -> LoanOut:
    out = (LoanDetail if detail else LoanOut).model_validate(loan)

    if loan.employee:
        out.employee_name = loan.employee.full_name
        out.employee_code = loan.employee.employee_code

    schedule = loan.schedule or []
    out.total_payable = sum((Decimal(i.amount) for i in schedule), ZERO)
    out.paid_amount = sum(
        (Decimal(i.amount) for i in schedule if i.status == "paid"), ZERO
    )
    out.outstanding = sum(
        (Decimal(i.amount) for i in schedule if i.status in OPEN), ZERO
    )
    out.paid_instalments = sum(1 for i in schedule if i.status == "paid")
    out.emi = Decimal(schedule[0].amount) if schedule else ZERO

    pending = [i for i in schedule if i.status == "pending"]
    out.next_due = pending[0].due_period if pending else None

    if detail:
        out.schedule = [LoanInstalmentOut.model_validate(i) for i in schedule]
    return out


@router.get("", response_model=list[LoanOut])
def list_loans(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    employee_id: int | None = None,
    loan_status: str | None = Query(default=None, alias="status"),
    kind: str | None = None,
):
    stmt = select(EmployeeLoan)
    if employee_id:
        stmt = stmt.where(EmployeeLoan.employee_id == employee_id)
    if loan_status:
        stmt = stmt.where(EmployeeLoan.status == loan_status)
    if kind:
        stmt = stmt.where(EmployeeLoan.kind == kind)

    rows = db.scalars(stmt.order_by(EmployeeLoan.id.desc())).unique()
    return [to_out(r) for r in rows]


@router.post("", response_model=LoanDetail, status_code=status.HTTP_201_CREATED)
def create_loan(
    payload: LoanCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if not db.get(Employee, payload.employee_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Employee not found")

    loan = EmployeeLoan(
        reference=next_reference(db),
        employee_id=payload.employee_id,
        kind=payload.kind,
        principal=payload.principal,
        interest_rate=payload.interest_rate,
        interest_method=payload.interest_method,
        instalments=payload.instalments,
        start_period=payload.start_period.replace(day=1),
        purpose=payload.purpose,
        note=payload.note,
    )
    db.add(loan)
    db.flush()

    for row in engine.build_schedule(
        payload.principal,
        payload.interest_rate,
        payload.interest_method,
        payload.instalments,
        loan.start_period,
    ):
        db.add(LoanInstalment(loan_id=loan.id, **row))

    db.commit()
    db.refresh(loan)
    return to_out(loan, detail=True)


@router.get("/{loan_id}", response_model=LoanDetail)
def read_loan(
    loan_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    loan = db.get(EmployeeLoan, loan_id)
    if not loan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    return to_out(loan, detail=True)


@router.post("/{loan_id}/actions", response_model=LoanDetail)
def loan_action(
    loan_id: int,
    payload: LoanAction,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    loan = db.get(EmployeeLoan, loan_id)
    if not loan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")

    if payload.action == "hold":
        loan.status = "on_hold"
    elif payload.action == "resume":
        loan.status = "active"
    elif payload.action in ("close", "foreclose"):
        # Foreclosure clears what is left; the balance is settled outside payroll.
        for instalment in loan.schedule:
            if instalment.status == "pending":
                instalment.status = "waived"
        loan.status = "closed"
        loan.closed_at = datetime.now(timezone.utc)

    if payload.note:
        loan.note = payload.note

    db.commit()
    db.refresh(loan)
    return to_out(loan, detail=True)


@router.post("/{loan_id}/instalments/{seq}/skip", response_model=LoanDetail)
def skip_instalment(
    loan_id: int,
    seq: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Skip a month and push the instalment to the end of the schedule."""
    loan = db.get(EmployeeLoan, loan_id)
    if not loan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")

    target = next((i for i in loan.schedule if i.seq == seq), None)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Instalment not found")
    if target.status != "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Only a pending instalment can be skipped"
        )

    target.status = "skipped"

    last = max(loan.schedule, key=lambda i: i.seq)
    db.add(
        LoanInstalment(
            loan_id=loan.id,
            seq=last.seq + 1,
            due_period=engine.add_months(last.due_period, 1),
            principal_part=target.principal_part,
            interest_part=target.interest_part,
            amount=target.amount,
        )
    )

    db.commit()
    db.refresh(loan)
    return to_out(loan, detail=True)


@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_loan(
    loan_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    loan = db.get(EmployeeLoan, loan_id)
    if not loan:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")

    paid = sum(1 for i in loan.schedule if i.status == "paid")
    if paid:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{paid} instalment(s) already recovered — close the loan instead.",
        )

    db.delete(loan)
    db.commit()


@router.get("/due/{period}", response_model=list[LoanInstalmentOut])
def due_for_period(
    period: date, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    rows = db.scalars(
        select(LoanInstalment)
        .join(EmployeeLoan)
        .where(
            LoanInstalment.due_period == period.replace(day=1),
            LoanInstalment.status == "pending",
            EmployeeLoan.status == "active",
        )
        .order_by(LoanInstalment.id)
    ).unique()
    return [LoanInstalmentOut.model_validate(r) for r in rows]

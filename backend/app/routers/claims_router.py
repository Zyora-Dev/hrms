"""Reimbursement claims, from the admin's side.

Approving decides two things: how much, and how it gets paid. "Through
payroll" writes a one-off earning onto the month's pay run, so the money and
the claim can never disagree; "separately" records the decision and leaves
the payment to whoever handles the bank transfer.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit, events, mailer
from app.db import get_db
from app.models import Admin, Employee, PayrollInput, PayrollRun, ReimbursementClaim
from app.routers.auth import current_admin
from app.routers.employee_portal import claim_out
from app.schemas import ClaimDecision, ClaimOut

router = APIRouter(prefix="/claims", tags=["reimbursement"])


@router.get("", response_model=list[ClaimOut])
def list_claims(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    claim_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
):
    stmt = select(ReimbursementClaim)

    if claim_status:
        stmt = stmt.where(ReimbursementClaim.status == claim_status)
    if employee_id:
        stmt = stmt.where(ReimbursementClaim.employee_id == employee_id)
    if date_from:
        stmt = stmt.where(ReimbursementClaim.spent_on >= date_from)
    if date_to:
        stmt = stmt.where(ReimbursementClaim.spent_on <= date_to)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.join(Employee).where(
            or_(
                func.lower(ReimbursementClaim.title).like(term),
                func.lower(ReimbursementClaim.reference).like(term),
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    rows = db.scalars(
        stmt.order_by(ReimbursementClaim.created_at.desc())
    ).unique()
    return [claim_out(c) for c in rows]


@router.get("/{claim_id}", response_model=ClaimOut)
def get_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """One claim on its own, for opening straight from a notification."""
    claim = db.get(ReimbursementClaim, claim_id)
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    return claim_out(claim)


@router.put("/{claim_id}", response_model=ClaimOut)
def decide(
    claim_id: int,
    payload: ClaimDecision,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    claim = db.get(ReimbursementClaim, claim_id)
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if claim.status not in ("pending", "approved"):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This claim is already {claim.status}"
        )
    if claim.paid_period is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This claim has already gone into a pay run",
        )

    claim.status = payload.status
    claim.decision_note = payload.note
    claim.decided_at = datetime.now(timezone.utc)
    claim.decided_by = admin.email
    claim.settlement = payload.settlement

    if payload.status == "approved":
        amount = payload.approved_amount
        claim.approved_amount = (
            Decimal(amount) if amount is not None else claim.amount
        )
        if claim.approved_amount > claim.amount:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "You cannot approve more than was claimed",
            )
    else:
        claim.approved_amount = None

    audit.record(
        db,
        action="action",
        entity="reimbursement_claim",
        entity_id=claim.id,
        label=f"{claim.reference} · {claim.title}",
        summary=(
            f"Claim {payload.status}"
            + (
                f" for {claim.approved_amount} via {payload.settlement}"
                if payload.status == "approved"
                else ""
            )
        ),
        commit=False,
    )
    db.commit()
    db.refresh(claim)

    config = mailer.config(db)
    if config.send_claim_decisions and claim.employee:
        mailer.queue(
            db,
            kind="claim_decision",
            to_email=claim.employee.work_email,
            to_name=claim.employee.full_name,
            subject=f"Your expense claim was {claim.status}",
            lines=[
                f"Hello {claim.employee.full_name or ''},".strip(),
                f"{claim.reference} — {claim.title} — was "
                f"<b>{claim.status}</b>"
                + (
                    f" for {claim.approved_amount}, to be settled "
                    f"{'with your pay' if claim.settlement == 'payroll' else 'separately'}."
                    if claim.status == "approved"
                    else "."
                ),
                *([f"Note from HR: {payload.note}"] if payload.note else []),
            ],
            action=("Open the portal", "/employee?tab=claims"),
            entity="reimbursement_claim",
            entity_id=claim.id,
            commit=True,
        )

    events.publish(
        f"employee:{claim.employee_id}",
        "reimbursement_claim",
        claim_id=claim.id,
        status=claim.status,
        message=f"{claim.reference} was {claim.status}",
    )
    events.publish("admin", "reimbursement_claim", claim_id=claim.id)
    return claim_out(claim)


@router.post("/{claim_id}/pay", response_model=ClaimOut)
def pay(
    claim_id: int,
    period: date,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Put an approved claim into a month's pay run, once."""
    claim = db.get(ReimbursementClaim, claim_id)
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if claim.status != "approved":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This claim is {claim.status}, not approved"
        )
    if claim.paid_period is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Already paid with {claim.paid_period:%B %Y}",
        )

    month = period.replace(day=1)
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == month))
    if run and run.status == "paid":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{month:%B %Y} is already paid — use the next month",
        )

    if claim.settlement == "payroll":
        line = PayrollInput(
            employee_id=claim.employee_id,
            period=month,
            kind="reimbursement",
            label=f"{claim.reference} · {claim.title}",
            amount=claim.approved_amount or claim.amount,
        )
        db.add(line)
        db.flush()
        claim.payroll_input_id = line.id
        summary = f"Added to {month:%B %Y} payroll"
    else:
        claim.paid_on = date.today()
        summary = f"Marked as settled outside payroll on {date.today()}"

    claim.paid_period = month
    claim.status = "paid"

    audit.record(
        db,
        action="action",
        entity="reimbursement_claim",
        entity_id=claim.id,
        label=f"{claim.reference} · {claim.title}",
        summary=summary,
        commit=False,
    )
    db.commit()
    db.refresh(claim)

    events.publish(
        f"employee:{claim.employee_id}",
        "reimbursement_claim",
        claim_id=claim.id,
        status=claim.status,
        message=f"{claim.reference} was settled",
    )
    events.publish("admin", "reimbursement_claim", claim_id=claim.id)
    return claim_out(claim)

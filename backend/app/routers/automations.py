"""Automations: what runs on its own, how often, and how it went."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, scheduler
from app.db import get_db
from app.jobs import JOBS
from app.models import Admin, Automation, AutomationRun
from app.routers.auth import current_admin
from app.schemas import AutomationOut, AutomationRunOut, AutomationUpdate

router = APIRouter(prefix="/automations", tags=["automations"])


def to_out(db: Session, row: Automation, with_history: bool = True) -> AutomationOut:
    spec = JOBS.get(row.key, {})
    recent = []
    if with_history:
        recent = [
            AutomationRunOut.model_validate(r)
            for r in db.scalars(
                select(AutomationRun)
                .where(AutomationRun.automation_id == row.id)
                .order_by(AutomationRun.started_at.desc())
                .limit(5)
            )
        ]

    return AutomationOut(
        id=row.id,
        key=row.key,
        name=spec.get("name", row.key),
        description=spec.get("description", ""),
        is_enabled=row.is_enabled,
        cadence=row.cadence,
        every_minutes=row.every_minutes,
        run_at=row.run_at,
        day_of_month=row.day_of_month,
        options=row.options or {},
        last_run_at=row.last_run_at,
        last_status=row.last_status,
        last_message=row.last_message,
        next_run_at=row.next_run_at,
        recent=recent,
    )


@router.get("", response_model=list[AutomationOut])
def list_automations(
    db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    # A job added since the last restart still needs a row.
    scheduler.ensure_rows(db)

    order = list(JOBS)
    rows = sorted(
        db.scalars(select(Automation)),
        key=lambda r: order.index(r.key) if r.key in order else 99,
    )
    return [to_out(db, row) for row in rows]


@router.put("/{key}", response_model=AutomationOut)
def update_automation(
    key: str,
    payload: AutomationUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.scalar(select(Automation).where(Automation.key == key))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is not None:
            setattr(row, field, value)

    # Changing the schedule must move the next run, not leave it on the old
    # clock until after it has fired once more.
    row.next_run_at = (
        scheduler.next_due(row, __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ))
        if row.is_enabled
        else None
    )

    audit.record(
        db,
        action="update",
        entity="automation",
        entity_id=row.id,
        label=JOBS.get(row.key, {}).get("name", row.key),
        summary=("Switched on" if row.is_enabled else "Switched off")
        + f" · {row.cadence}",
        commit=False,
    )
    db.commit()
    db.refresh(row)
    return to_out(db, row)


@router.post("/{key}/run", response_model=AutomationOut)
def run_now(
    key: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Run it this second, whatever the schedule says."""
    row = db.scalar(select(Automation).where(Automation.key == key))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Automation not found")

    entry = scheduler.run_job(db, row, triggered_by=admin.email[:16])

    audit.record(
        db,
        action="action",
        entity="automation",
        entity_id=row.id,
        label=JOBS.get(row.key, {}).get("name", row.key),
        summary=f"Run by hand · {entry.status} · {entry.message or ''}"[:400],
    )
    db.refresh(row)
    return to_out(db, row)


@router.get("/{key}/runs", response_model=list[AutomationRunOut])
def history(
    key: str,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    limit: int = 30,
):
    return list(
        db.scalars(
            select(AutomationRun)
            .where(AutomationRun.key == key)
            .order_by(AutomationRun.started_at.desc())
            .limit(limit)
        )
    )

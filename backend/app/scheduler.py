"""Running the automations on time.

A single loop that wakes every half minute, asks the database which jobs are
due, and runs them one at a time. No external scheduler, no extra process —
which is the right trade for one API process, and the thing to revisit the
day there are two, because both would run every job.

A job that throws is recorded as failed and the loop carries on: one broken
terminal must not stop the backups.
"""

import asyncio
import contextlib
import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.jobs import JOBS
from app.models import Automation, AutomationRun
from app.services import attendance_service as svc

log = logging.getLogger("hrms.scheduler")

TICK_SECONDS = 30
# Runs older than this are dropped, so the history stays readable.
KEEP_RUNS = 50


def ensure_rows(db: Session) -> None:
    """Every job in the catalogue gets a row, switched off to begin with."""
    existing = {row.key for row in db.scalars(select(Automation))}

    for key, spec in JOBS.items():
        if key in existing:
            continue

        default_time = spec.get("default_time", "02:00")
        hour, _, minute = default_time.partition(":")

        db.add(
            Automation(
                key=key,
                is_enabled=False,
                cadence=spec.get("default_cadence", "daily"),
                every_minutes=spec.get("default_minutes", 15),
                run_at=time(int(hour), int(minute)),
                day_of_month=spec.get("default_day", 1),
                options=dict(spec.get("options", {})),
            )
        )
    db.commit()


def next_due(row: Automation, after: datetime) -> datetime:
    """When this job should next run, counting from `after` (org timezone)."""
    zone = svc.tz()
    moment = after.astimezone(zone)

    if row.cadence == "every_minutes":
        return moment + timedelta(minutes=max(row.every_minutes, 1))

    at = row.run_at or time(2, 0)

    if row.cadence == "daily":
        candidate = datetime.combine(moment.date(), at).replace(tzinfo=zone)
        if candidate <= moment:
            candidate += timedelta(days=1)
        return candidate

    # Monthly, on a given day. A day past the end of a short month runs on
    # its last day rather than being skipped.
    day = min(max(row.day_of_month, 1), 28)
    candidate = datetime.combine(moment.date().replace(day=day), at).replace(
        tzinfo=zone
    )
    if candidate <= moment:
        year = moment.year + (moment.month == 12)
        month = 1 if moment.month == 12 else moment.month + 1
        candidate = datetime.combine(date(year, month, day), at).replace(tzinfo=zone)
    return candidate


def run_job(db: Session, row: Automation, triggered_by: str = "schedule") -> AutomationRun:
    """Run one job and record what happened."""
    spec = JOBS.get(row.key)
    started = datetime.now(timezone.utc)

    entry = AutomationRun(
        automation_id=row.id,
        key=row.key,
        started_at=started,
        triggered_by=triggered_by,
    )

    if spec is None:
        entry.status = "skipped"
        entry.message = "No job with this name exists any more"
    else:
        try:
            entry.message = (spec["run"](db, row.options or {}) or "Done")[:400]
            entry.status = "ok"
        except Exception as exc:  # one bad job must not stop the rest
            db.rollback()
            entry.status = "failed"
            entry.message = f"{type(exc).__name__}: {exc}"[:400]
            log.exception("automation %s failed", row.key)

    entry.finished_at = datetime.now(timezone.utc)

    row.last_run_at = entry.finished_at
    row.last_status = entry.status
    row.last_message = entry.message
    row.next_run_at = next_due(row, entry.finished_at) if row.is_enabled else None

    db.add(entry)
    db.commit()

    trim_history(db, row.id)
    return entry


def trim_history(db: Session, automation_id: int) -> None:
    keep = [
        r.id
        for r in db.scalars(
            select(AutomationRun)
            .where(AutomationRun.automation_id == automation_id)
            .order_by(AutomationRun.started_at.desc())
            .limit(KEEP_RUNS)
        )
    ]
    if len(keep) < KEEP_RUNS:
        return

    db.query(AutomationRun).filter(
        AutomationRun.automation_id == automation_id,
        AutomationRun.id.notin_(keep),
    ).delete(synchronize_session=False)
    db.commit()


def due_now(db: Session) -> list[Automation]:
    now = datetime.now(timezone.utc)
    rows = db.scalars(select(Automation).where(Automation.is_enabled.is_(True)))

    due = []
    for row in rows:
        if row.next_run_at is None:
            # Newly enabled: set the clock running rather than firing at once.
            row.next_run_at = next_due(row, now)
            continue
        if row.next_run_at <= now:
            due.append(row)

    db.commit()
    return due


async def loop() -> None:
    with SessionLocal() as db:
        ensure_rows(db)

    while True:
        try:
            with SessionLocal() as db:
                for row in due_now(db):
                    log.info("automation %s starting", row.key)
                    run_job(db, row)
        except Exception:
            # The loop itself must survive anything the database does.
            log.exception("scheduler tick failed")

        await asyncio.sleep(TICK_SECONDS)


def start(app) -> None:
    """Attach the loop to the application's lifetime."""

    @app.on_event("startup")
    async def _start() -> None:
        app.state.scheduler = asyncio.create_task(loop())

    @app.on_event("shutdown")
    async def _stop() -> None:
        task = getattr(app.state, "scheduler", None)
        if task:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

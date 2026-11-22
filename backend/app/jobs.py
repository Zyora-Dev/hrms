"""The work the automations actually do.

Each job is a plain function taking a session and its options, returning a
sentence saying what it did. They are written to be safe to run twice: the
scheduler can restart mid-run, and an admin can always press "run now".
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    BiometricDevice,
    Employee,
    LeaveBalance,
    LeaveType,
    PayrollRun,
)
from app.notifications import notify
from app.services import attendance_service as svc


def today_local() -> date:
    return datetime.now(svc.tz()).date()


# ---------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------


def fetch_devices(db: Session, options: dict) -> str:
    """Pull punches from every active terminal."""
    from app.routers import devices as device_router

    devices = list(
        db.scalars(
            select(BiometricDevice).where(BiometricDevice.is_active.is_(True))
        )
    )
    if not devices:
        return "No active terminal is registered"

    stored = 0
    failed = []
    for device in devices:
        try:
            result = device_router.fetch_device(device.id, db=db, _=None, full=False)
            stored += result.stored
        except Exception as exc:  # a terminal being offline is normal
            failed.append(f"{device.name}: {str(exc)[:60]}")

    summary = f"{stored} punch(es) from {len(devices) - len(failed)} terminal(s)"
    if failed:
        summary += f" · could not reach {len(failed)}: {'; '.join(failed[:2])}"
    return summary


def recompute_attendance(db: Session, options: dict) -> str:
    """Rebuild the last few days, in case punches arrived late."""
    days = int(options.get("days", 2))
    end = today_local()
    start = end - timedelta(days=days - 1)

    touched, people = svc.recompute_range(db, start, end, None)
    return f"{touched} day(s) rebuilt for {people} employee(s) from {start} to {end}"


def accrue_leave(db: Session, options: dict) -> str:
    """Add this month's entitlement to every balance, once."""
    period = today_local().replace(day=1)

    types = list(
        db.scalars(select(LeaveType).where(LeaveType.is_active.is_(True)))
    )
    if not types:
        return "No active leave type"

    employees = list(
        db.scalars(
            select(Employee).where(
                Employee.status == "active",
                Employee.date_of_joining <= today_local(),
            )
        )
    )

    added = 0
    for employee in employees:
        for leave_type in types:
            # The policy already states an accrual per month; dividing an
            # annual figure here would disagree with the leave screen.
            monthly = Decimal(str(leave_type.monthly_accrual or 0))
            if monthly <= 0:
                continue

            existing = db.scalar(
                select(LeaveBalance).where(
                    LeaveBalance.employee_id == employee.id,
                    LeaveBalance.leave_type_id == leave_type.id,
                    LeaveBalance.period == period,
                )
            )
            if existing:
                # Already accrued for this month — running twice must not
                # double anybody's leave.
                continue

            previous = db.scalar(
                select(LeaveBalance)
                .where(
                    LeaveBalance.employee_id == employee.id,
                    LeaveBalance.leave_type_id == leave_type.id,
                    LeaveBalance.period < period,
                )
                .order_by(LeaveBalance.period.desc())
                .limit(1)
            )
            opening = (
                Decimal(str(previous.closing))
                if previous and leave_type.carry_forward
                else Decimal("0")
            )

            db.add(
                LeaveBalance(
                    employee_id=employee.id,
                    leave_type_id=leave_type.id,
                    period=period,
                    opening=opening,
                    accrued=monthly.quantize(Decimal("0.01")),
                    used=Decimal("0"),
                    closing=(opening + monthly).quantize(Decimal("0.01")),
                )
            )
            added += 1

    db.commit()
    return f"{added} balance(s) accrued for {period:%B %Y}"


def probation_reminders(db: Session, options: dict) -> str:
    """Tell the admin whose probation ends shortly."""
    within = int(options.get("days_ahead", 7))
    today = today_local()
    horizon = today + timedelta(days=within)

    people = list(
        db.scalars(
            select(Employee).where(
                Employee.status.in_(("active", "probation")),
                Employee.probation_end_date.is_not(None),
                Employee.probation_end_date >= today,
                Employee.probation_end_date <= horizon,
            )
        )
    )
    if not people:
        return "Nobody is finishing probation in the next " f"{within} days"

    for employee in people:
        notify(
            db,
            kind="probation",
            title=f"{employee.full_name} finishes probation on "
            f"{employee.probation_end_date:%d %b}",
            body=f"{employee.employee_code} · confirm or extend before the date",
            link=f"/admin/employees/{employee.id}",
            entity="employee",
            entity_id=employee.id,
        )
    db.commit()
    return f"{len(people)} probation reminder(s) raised"


def celebrations(db: Session, options: dict) -> str:
    """Birthday and work-anniversary greetings, on the day."""
    today = today_local()

    people = list(
        db.scalars(select(Employee).where(Employee.status == "active"))
    )
    raised = 0

    for employee in people:
        birthday = employee.date_of_birth
        if birthday and (birthday.month, birthday.day) == (today.month, today.day):
            notify(
                db,
                kind="celebration",
                title=f"It is {employee.full_name}'s birthday today",
                body=employee.employee_code,
                link=f"/admin/employees/{employee.id}",
                entity="employee",
                entity_id=employee.id,
            )
            notify(
                db,
                kind="celebration",
                title="Happy birthday!",
                body="From everyone here.",
                employee_id=employee.id,
            )
            raised += 1

        joined = employee.date_of_joining
        if joined and (joined.month, joined.day) == (today.month, today.day):
            years = today.year - joined.year
            if years >= 1:
                notify(
                    db,
                    kind="celebration",
                    title=f"{employee.full_name} completes {years} year(s) today",
                    body=employee.employee_code,
                    link=f"/admin/employees/{employee.id}",
                    entity="employee",
                    entity_id=employee.id,
                )
                notify(
                    db,
                    kind="celebration",
                    title=f"Happy {years}-year work anniversary!",
                    body="Thank you for the time you have given us.",
                    employee_id=employee.id,
                )
                raised += 1

    db.commit()
    return f"{raised} greeting(s) today" if raised else "Nothing to celebrate today"


def payroll_reminder(db: Session, options: dict) -> str:
    """Nudge the admin if this month has not been run yet."""
    period = today_local().replace(day=1)
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == period))

    if run and run.status in ("approved", "paid"):
        return f"{period:%B %Y} is already {run.status}"

    notify(
        db,
        kind="payroll",
        title=f"Payroll for {period:%B %Y} is not finished",
        body="Run it, check the payslips and approve when they look right.",
        link="/admin/payroll",
        entity="payroll_run",
        entity_id=run.id if run else None,
    )
    db.commit()
    return f"Reminder raised for {period:%B %Y}"


def take_backup(db: Session, options: dict) -> str:
    """A scheduled database dump, kept to the configured number of copies."""
    from app.routers import backups as backup_router

    made = backup_router.create_backup(db=db, admin=None)

    keep = int(options.get("keep", 7))
    root = backup_router.ensure_root()
    files = sorted(
        (p for p in root.glob("hrms-*.dump") if p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    removed = 0
    for old in files[keep:]:
        old.unlink(missing_ok=True)
        removed += 1

    summary = f"{made.name} ({made.size_bytes // 1024} KB)"
    return summary + (f" · {removed} older copy(ies) removed" if removed else "")


def prune_audit(db: Session, options: dict) -> str:
    """Drop audit entries older than the retention period."""
    from app.models import AuditLog

    months = int(options.get("keep_months", 24))
    cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)

    removed = (
        db.query(AuditLog).filter(AuditLog.at < cutoff).delete(synchronize_session=False)
    )
    db.commit()
    return (
        f"{removed} entry(ies) older than {months} months removed"
        if removed
        else f"Nothing older than {months} months"
    )


def send_email_queue(db: Session, options: dict) -> str:
    """Hand whatever is waiting in the outbox to the mail provider."""
    from app import mailer

    if not mailer.provider_ready():
        return "No mail provider is configured in .env"

    sent, failed = mailer.flush(db, limit=int(options.get("batch", 50)))
    if not sent and not failed:
        return "Nothing waiting"
    return f"{sent} sent, {failed} failed"


# ---------------------------------------------------------------------------
# The catalogue
# ---------------------------------------------------------------------------

JOBS: dict[str, dict] = {
    "email_outbox": {
        "name": "Send queued email",
        "description": "Delivers anything waiting in the outbox and retries "
        "what failed.",
        "run": send_email_queue,
        "default_cadence": "every_minutes",
        "default_minutes": 5,
        "options": {"batch": 50},
    },
    "device_fetch": {
        "name": "Fetch punches from terminals",
        "description": "Pulls new scans from every active biometric device and "
        "rebuilds the days they touch.",
        "run": fetch_devices,
        "default_cadence": "every_minutes",
        "default_minutes": 15,
        "options": {},
    },
    "attendance_recompute": {
        "name": "Rebuild recent attendance",
        "description": "Recalculates the last couple of days, in case punches "
        "or holidays arrived after the fact.",
        "run": recompute_attendance,
        "default_cadence": "daily",
        "default_time": "02:00",
        "options": {"days": 2},
    },
    "leave_accrual": {
        "name": "Accrue monthly leave",
        "description": "Adds each leave type's monthly accrual to every "
        "balance, once per month.",
        "run": accrue_leave,
        "default_cadence": "monthly",
        "default_day": 1,
        "default_time": "01:00",
        "options": {},
    },
    "probation_reminder": {
        "name": "Probation reminders",
        "description": "Raises a notification before anyone's probation ends.",
        "run": probation_reminders,
        "default_cadence": "daily",
        "default_time": "08:00",
        "options": {"days_ahead": 7},
    },
    "celebrations": {
        "name": "Birthdays and anniversaries",
        "description": "Greets the employee and tells the admin, on the day.",
        "run": celebrations,
        "default_cadence": "daily",
        "default_time": "08:30",
        "options": {},
    },
    "payroll_reminder": {
        "name": "Payroll reminder",
        "description": "Nudges the admin if the month's payroll has not been "
        "approved yet.",
        "run": payroll_reminder,
        "default_cadence": "monthly",
        "default_day": 25,
        "default_time": "09:00",
        "options": {},
    },
    "backup": {
        "name": "Database backup",
        "description": "Takes a dump and keeps the most recent few.",
        "run": take_backup,
        "default_cadence": "daily",
        "default_time": "03:00",
        "options": {"keep": 7},
    },
    "audit_retention": {
        "name": "Trim the audit trail",
        "description": "Removes audit entries past the retention period.",
        "run": prune_audit,
        "default_cadence": "monthly",
        "default_day": 1,
        "default_time": "04:00",
        "options": {"keep_months": 24},
    },
}

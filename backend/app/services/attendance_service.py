"""Persisting computed attendance days."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import attendance as engine
from app.config import settings
from app.models import (
    AttendanceDay,
    Holiday,
    AttendancePunch,
    AttendanceSettings,
    Employee,
    EmployeeShift,
    Shift,
)


def holiday_map(
    db: Session, date_from: date, date_to: date
) -> dict[date, list[Holiday]]:
    """Holidays in range, grouped by date."""
    out: dict[date, list[Holiday]] = {}
    for row in db.scalars(
        select(Holiday).where(
            Holiday.holiday_date >= date_from, Holiday.holiday_date <= date_to
        )
    ):
        out.setdefault(row.holiday_date, []).append(row)
    return out


def holiday_for(
    holidays: dict[date, list[Holiday]], day: date, location: str | None
) -> Holiday | None:
    """A holiday with no location applies everywhere."""
    for row in holidays.get(day, []):
        if not row.location:
            return row
        if location and row.location.strip().lower() == location.strip().lower():
            return row
    return None


def load_settings(db: Session) -> AttendanceSettings | None:
    return db.scalar(
        select(AttendanceSettings).order_by(AttendanceSettings.id).limit(1)
    )


def tz() -> ZoneInfo:
    return ZoneInfo(settings.TIMEZONE)


def shift_resolver(db: Session, employee_id: int):
    """Returns a function giving the shift assigned on a given date."""
    assignments = list(
        db.scalars(
            select(EmployeeShift)
            .where(EmployeeShift.employee_id == employee_id)
            .order_by(EmployeeShift.effective_from.desc())
        )
    )

    def resolve(day: date) -> Shift | None:
        for a in assignments:
            if a.effective_from <= day and (a.effective_to is None or day <= a.effective_to):
                return a.shift
        return None

    return resolve


def day_is_over(day: date, shift: Shift | None, zone: ZoneInfo) -> bool:
    """Has the chance to scan passed?

    Calling someone absent while their shift is still running is wrong — at
    the start of a day nobody has been anywhere yet. A day only closes once
    its shift has ended (plus the time a continuation may run on), or at
    midnight when there is no shift.
    """
    now = datetime.now(zone)
    if day < now.date() - timedelta(days=1):
        return True

    if shift is None:
        return day < now.date()

    window = engine.shift_window(shift, day, zone)
    return now >= window.open_until


def apply_status_override(row: AttendanceDay) -> None:
    """An admin marking the day by hand outranks the punches."""
    if row.status_override:
        row.status = row.status_override


def apply_continuation_override(row: AttendanceDay, policy) -> None:
    """The admin's word beats the punches.

    `forced` records a continuation the device never saw (someone stayed on
    but the out-scan went to the next shift's reader); `excluded` dismisses a
    spill that was only a stray scan. Overtime follows the same policy as a
    derived continuation, so the two paths cannot disagree.
    """
    mode = row.continuation_mode or "auto"

    if mode == "forced":
        minutes = row.continuation_override_minutes or row.continued_minutes
        row.is_continued = True
        row.continued_minutes = minutes
        if (
            policy.overtime_enabled
            and policy.continuation_counts_as_overtime
            and minutes >= policy.overtime_min_minutes
        ):
            row.overtime_minutes = min(minutes, policy.overtime_max_minutes_per_day)

    elif mode == "excluded":
        row.is_continued = False
        row.continued_minutes = 0
        row.continued_into_shift_id = None
        # The only overtime this engine produces comes from a spill, so
        # dismissing the spill has to take the overtime with it.
        row.overtime_minutes = 0


def punches_claimed_by(
    db: Session, employee_id: int, day: date
) -> list[AttendancePunch]:
    """Exactly the punches the engine attributed to one attendance date.

    Working this out by timestamp would be guesswork — rounding moves the
    stored first_in away from the punch it came from, and a night shift's
    scans land on the next calendar date. Asking the engine is the only
    answer that always matches what the day was built from.
    """
    zone = tz()
    window_start = datetime.combine(day - timedelta(days=2), datetime.min.time())
    window_end = datetime.combine(day + timedelta(days=2), datetime.max.time())

    punches = list(
        db.scalars(
            select(AttendancePunch)
            .where(
                AttendancePunch.employee_id == employee_id,
                AttendancePunch.punch_at >= window_start.replace(tzinfo=zone),
                AttendancePunch.punch_at <= window_end.replace(tzinfo=zone),
            )
            .order_by(AttendancePunch.punch_at)
        )
    )
    if not punches:
        return []

    settings_row = load_settings(db)
    policy = engine.Policy.from_settings(settings_row)
    all_shifts = list(db.scalars(select(Shift)))

    claimed: set[int] = set()
    for result in engine.build_days(
        punches, shift_resolver(db, employee_id), zone, all_shifts, policy
    ):
        if result.attendance_date == day:
            claimed.update(result.punch_ids)

    return [p for p in punches if p.id in claimed]


def recompute_employee(
    db: Session,
    employee_id: int,
    date_from: date,
    date_to: date,
    all_shifts: list[Shift] | None = None,
    settings_row: AttendanceSettings | None = None,
    holidays: dict[date, list[Holiday]] | None = None,
) -> int:
    """Rebuild attendance days for one employee over a date range.

    Punches are read with a margin either side, because a day's punches can
    sit on the neighbouring calendar date (night shifts and continuations).
    """
    zone = tz()
    all_shifts = all_shifts if all_shifts is not None else list(db.scalars(select(Shift)))
    settings_row = settings_row if settings_row is not None else load_settings(db)
    policy = engine.Policy.from_settings(settings_row)
    resolve = shift_resolver(db, employee_id)

    if holidays is None:
        holidays = holiday_map(db, date_from, date_to)
    employee = db.get(Employee, employee_id)
    location = employee.work_location if employee else None

    window_start = datetime.combine(date_from - timedelta(days=2), datetime.min.time())
    window_end = datetime.combine(date_to + timedelta(days=2), datetime.max.time())

    punches = list(
        db.scalars(
            select(AttendancePunch)
            .where(
                AttendancePunch.employee_id == employee_id,
                AttendancePunch.punch_at >= window_start.replace(tzinfo=zone),
                AttendancePunch.punch_at <= window_end.replace(tzinfo=zone),
            )
            .order_by(AttendancePunch.punch_at)
        )
    )

    computed = {
        d.attendance_date: d
        for d in engine.build_days(punches, resolve, zone, all_shifts, policy)
    }

    existing = {
        d.attendance_date: d
        for d in db.scalars(
            select(AttendanceDay).where(
                AttendanceDay.employee_id == employee_id,
                AttendanceDay.attendance_date >= date_from,
                AttendanceDay.attendance_date <= date_to,
            )
        )
    }

    touched = 0
    day = date_from
    while day <= date_to:
        shift = resolve(day)
        result = computed.get(day)
        row = existing.get(day)

        if result is None:
            # No punches. Weekly off or holiday, otherwise absent.
            holiday = holiday_for(holidays, day, location)

            # A weekly off wins: a holiday falling on a rest day earns nothing
            # extra.
            if engine.is_weekly_off(shift, day):
                status = engine.STATUS_WEEKLY_OFF
            elif holiday is not None and holiday.is_paid:
                status = engine.STATUS_HOLIDAY
            elif not day_is_over(day, shift, zone):
                # The shift has not finished — there is nothing to conclude.
                status = engine.STATUS_NOT_MARKED
            elif settings_row and not settings_row.auto_absent_without_punch:
                # Admin marks absence by hand; leave the day blank instead.
                status = row.status if row else engine.STATUS_NOT_MARKED
            else:
                status = engine.STATUS_ABSENT
            if row is None:
                row = AttendanceDay(employee_id=employee_id, attendance_date=day)
                db.add(row)
            # Leave is sticky because it was approved deliberately. Holiday is
            # re-derived, so removing one from the calendar undoes it.
            if row.status != "on_leave":
                row.status = status
            row.shift_id = shift.id if shift else None
            row.first_in = row.last_out = None
            row.worked_minutes = row.overtime_minutes = 0
            row.late_minutes = row.early_exit_minutes = 0
            row.is_continued = False
            row.continued_minutes = 0
            row.continued_into_shift_id = None
            row.has_manual_punch = False
            apply_continuation_override(row, policy)
            apply_status_override(row)
        else:
            if row is None:
                row = AttendanceDay(employee_id=employee_id, attendance_date=day)
                db.add(row)
            row.shift_id = result.shift_id or (shift.id if shift else None)
            row.first_in = result.first_in
            row.last_out = result.last_out
            row.worked_minutes = result.worked_minutes
            row.overtime_minutes = result.overtime_minutes
            row.late_minutes = result.late_minutes
            row.early_exit_minutes = result.early_exit_minutes
            row.is_continued = result.is_continued
            row.continued_minutes = result.continued_minutes
            row.continued_into_shift_id = result.continued_into_shift_id
            row.has_manual_punch = result.has_manual_punch
            row.remarks = result.remarks
            row.status = (
                engine.STATUS_WEEKLY_OFF
                if engine.is_weekly_off(shift, day) and result.worked_minutes == 0
                else result.status
            )

            # Punched in but not out yet: they are at work, so the day counts
            # as present until the scans say otherwise. The engine's fallback
            # of half a day only makes sense once the chance to scan out has
            # passed.
            if (
                result.last_out is None
                and result.worked_minutes == 0
                and not day_is_over(day, shift, zone)
            ):
                row.status = engine.STATUS_PRESENT
                # "Missing out punch" is a verdict, not news, while they may
                # still be at work.
                row.remarks = None

            apply_continuation_override(row, policy)
            apply_status_override(row)

        touched += 1
        day += timedelta(days=1)

    db.commit()
    return touched


def recompute_range(
    db: Session,
    date_from: date,
    date_to: date,
    employee_id: int | None = None,
) -> tuple[int, int]:
    """Recompute for one employee or everyone. Returns (days, employees)."""
    all_shifts = list(db.scalars(select(Shift)))
    settings_row = load_settings(db)
    holidays = holiday_map(db, date_from, date_to)

    if employee_id is not None:
        ids = [employee_id]
    else:
        ids = list(db.scalars(select(Employee.id).order_by(Employee.id)))

    days = 0
    for eid in ids:
        days += recompute_employee(
            db, eid, date_from, date_to, all_shifts, settings_row, holidays
        )
    return days, len(ids)


def affected_dates(punch_at: datetime) -> tuple[date, date]:
    """A punch can belong to the previous day's shift, so recompute both."""
    local = punch_at.astimezone(tz()).date()
    return local - timedelta(days=1), local

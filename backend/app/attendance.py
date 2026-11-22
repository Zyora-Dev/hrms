"""Turning raw punches into attendance days.

The hard part is deciding which *attendance date* a punch belongs to. A punch at
02:00 can mean three different things:

  * a night-shift employee who started at 22:00 yesterday — belongs to yesterday
  * a morning-shift employee who carried on well past 18:00 — belongs to yesterday
  * someone on an early shift starting 02:00 today — belongs to today

Calendar date is therefore not the answer. Each attendance date owns a window
that runs from `early_in_hours` before the shift starts to the continuation
allowance after it ends — expressed in shifts, because carrying on means
working another shift, half or whole. Punches are walked in chronological
order: a punch extends the currently open day if it still falls inside that
day's window, otherwise the open day is closed and a new one begins.

That single rule covers both overnight shifts and a shift that continues into
the next one.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import AttendancePunch, Shift

STATUS_PRESENT = "present"
STATUS_HALF_DAY = "half_day"
STATUS_ABSENT = "absent"
STATUS_WEEKLY_OFF = "weekly_off"
STATUS_HOLIDAY = "holiday"
# Nothing concluded yet: the shift has not finished, so the day is open.
STATUS_NOT_MARKED = "not_marked"
STATUS_ON_LEAVE = "on_leave"


def combine(day: date, at: time, tz: ZoneInfo) -> datetime:
    """Wall-clock time on a given day, in the organisation's timezone."""
    return datetime.combine(day, at).replace(tzinfo=tz)


@dataclass
class Policy:
    """Org-wide rules, read from AttendanceSettings."""

    round_punch_minutes: int = 0
    overtime_enabled: bool = True
    overtime_min_minutes: int = 30
    overtime_max_minutes_per_day: int = 240
    continuation_counts_as_overtime: bool = True

    @classmethod
    def from_settings(cls, settings) -> "Policy":
        if settings is None:
            return cls()
        return cls(
            round_punch_minutes=settings.round_punch_minutes,
            overtime_enabled=settings.overtime_enabled,
            overtime_min_minutes=settings.overtime_min_minutes,
            overtime_max_minutes_per_day=settings.overtime_max_minutes_per_day,
            continuation_counts_as_overtime=settings.continuation_counts_as_overtime,
        )


def round_to(moment: datetime, minutes: int) -> datetime:
    """Round a punch to the nearest `minutes` (0 leaves it untouched)."""
    if minutes <= 0:
        return moment
    seconds = minutes * 60
    stamp = moment.timestamp()
    return datetime.fromtimestamp(round(stamp / seconds) * seconds, tz=moment.tzinfo)


@dataclass
class ShiftWindow:
    """One attendance date's claim on the timeline."""

    attendance_date: date
    shift: Shift
    start: datetime
    end: datetime
    # Outer bounds — punches inside these belong to this attendance date.
    open_from: datetime
    open_until: datetime

    def covers(self, moment: datetime) -> bool:
        return self.open_from <= moment <= self.open_until


def shift_window(shift: Shift, attendance_date: date, tz: ZoneInfo) -> ShiftWindow:
    start = combine(attendance_date, shift.start_time, tz)
    end = start + timedelta(minutes=shift.duration_minutes)
    return ShiftWindow(
        attendance_date=attendance_date,
        shift=shift,
        start=start,
        end=end,
        open_from=start - timedelta(hours=shift.early_in_hours),
        open_until=end + timedelta(minutes=shift.continuation_window_minutes),
    )


@dataclass
class DayResult:
    attendance_date: date
    shift_id: int | None
    first_in: datetime | None = None
    last_out: datetime | None = None
    worked_minutes: int = 0
    overtime_minutes: int = 0
    late_minutes: int = 0
    early_exit_minutes: int = 0
    is_continued: bool = False
    continued_minutes: int = 0
    continued_into_shift_id: int | None = None
    status: str = STATUS_ABSENT
    has_manual_punch: bool = False
    remarks: str | None = None
    punch_ids: list[int] = field(default_factory=list)


def pair_punches(
    punches: list[AttendancePunch], round_minutes: int = 0
) -> list[tuple[datetime, datetime]]:
    """Pair punches into in/out sessions.

    Devices often report every scan without saying whether it is an entry or an
    exit, so unlabelled punches simply alternate. An odd trailing punch is left
    unpaired rather than guessed at.
    """
    sessions: list[tuple[datetime, datetime]] = []
    open_in: datetime | None = None

    for punch in punches:
        direction = (punch.direction or "auto").lower()
        at = round_to(punch.punch_at, round_minutes)

        if direction == "in":
            # Two INs in a row: keep the earliest, the later one is a re-scan.
            if open_in is None:
                open_in = at
        elif direction == "out":
            if open_in is not None:
                sessions.append((open_in, at))
                open_in = None
            elif sessions:
                # OUT with no open IN — extend the previous session.
                sessions[-1] = (sessions[-1][0], at)
        else:  # "auto" — alternate
            if open_in is None:
                open_in = at
            else:
                sessions.append((open_in, at))
                open_in = None

    return sessions


def overlapping_shift(
    moment: datetime, own_shift_id: int, shifts: list[Shift], tz: ZoneInfo
) -> int | None:
    """Which other shift's window a continuation reached, if any.

    Lets a morning employee who worked until 02:00 be reported as having run
    into the night shift, rather than just as unexplained overtime.
    """
    for shift in shifts:
        if shift.id == own_shift_id or not shift.is_active:
            continue
        for day in (moment.date() - timedelta(days=1), moment.date()):
            window = shift_window(shift, day, tz)
            if window.start <= moment <= window.end:
                return shift.id
    return None


def build_days(
    punches: list[AttendancePunch],
    shift_for_date,
    tz: ZoneInfo,
    all_shifts: list[Shift] | None = None,
    policy: Policy | None = None,
) -> list[DayResult]:
    """Group a single employee's punches into attendance days.

    `shift_for_date(d)` returns the Shift assigned on date `d`, or None.
    """
    ordered = sorted(punches, key=lambda p: p.punch_at)
    groups: list[tuple[ShiftWindow | None, list[AttendancePunch]]] = []

    current: ShiftWindow | None = None
    bucket: list[AttendancePunch] = []

    for punch in ordered:
        local = punch.punch_at.astimezone(tz)

        # A punch entered by hand carries the date the admin chose. That is the
        # answer — no window, grace or lateness gets to move it somewhere else.
        if (punch.source or "").lower() == "manual":
            if current is not None and current.attendance_date == local.date():
                bucket.append(punch)
                continue

            if bucket:
                groups.append((current, bucket))
                bucket = []

            current = calendar_window(
                shift_for_date(local.date()), local.date(), tz
            )
            bucket.append(punch)
            continue

        # The continuation allowance only applies to somebody who is still on
        # the clock. Once their sessions are balanced they have gone home, and
        # the next scan starts a new day however much allowance is left.
        if current and current.covers(local):
            if local <= current.end or still_clocked_in(bucket):
                bucket.append(punch)
                continue

        if bucket:
            groups.append((current, bucket))
            bucket = []

        # Open a new day. A punch can belong to the shift that started the day
        # before — a night shift running into the morning — but only up to that
        # shift's own end: a new group means nobody was left clocked in, so
        # there is nothing for it to be a continuation of.
        current = None
        for candidate_date in (local.date() - timedelta(days=1), local.date()):
            shift = shift_for_date(candidate_date)
            if not shift:
                continue
            window = shift_window(shift, candidate_date, tz)
            if window.open_from <= local <= window.end:
                current = window
                break

        if current is None:
            # No shift assigned, or the punch falls outside every window.
            # It still belongs to the day it happened on, and the window has
            # to span that whole day — a window that does not contain its own
            # punch would reject the matching out-scan and strand it.
            current = calendar_window(
                shift_for_date(local.date()), local.date(), tz
            )

        bucket.append(punch)

    if bucket:
        groups.append((current, bucket))

    return [
        summarise(window, items, tz, all_shifts or [], policy or Policy())
        for window, items in merge_by_date(groups)
    ]


def still_clocked_in(punches: list[AttendancePunch]) -> bool:
    """Is there an entry with no matching exit yet?

    Mirrors how `pair_punches` reads the same scans, so grouping and
    summarising never disagree about who is on the clock.
    """
    open_in = False
    for punch in punches:
        direction = (punch.direction or "auto").lower()
        if direction == "in":
            open_in = True
        elif direction == "out":
            open_in = False
        else:
            open_in = not open_in
    return open_in


def calendar_window(
    shift: Shift | None, day: date, tz: ZoneInfo
) -> ShiftWindow:
    """A whole calendar day, for punches no shift window claims.

    The shift is kept when there is one so lateness and overtime still have
    something to measure against, but the bounds are the day itself.
    """
    start = combine(day, shift.start_time, tz) if shift else combine(day, time.min, tz)
    end = (
        start + timedelta(minutes=shift.duration_minutes)
        if shift
        else start + timedelta(days=1)
    )
    open_from = combine(day, time.min, tz)

    return ShiftWindow(
        attendance_date=day,
        shift=shift,  # type: ignore[arg-type]
        start=start,
        end=end,
        open_from=open_from,
        open_until=open_from + timedelta(days=1),
    )


def merge_by_date(
    groups: list[tuple[ShiftWindow | None, list[AttendancePunch]]],
) -> list[tuple[ShiftWindow | None, list[AttendancePunch]]]:
    """One attendance date owns one row, so its punches must arrive together.

    Two windows can land on the same date — a shift window and the calendar
    fallback, say — and summarising them separately would leave the later one
    overwriting the earlier, losing punches.
    """
    merged: dict[date, tuple[ShiftWindow | None, list[AttendancePunch]]] = {}

    for window, items in groups:
        if window is None:
            continue
        existing = merged.get(window.attendance_date)
        if existing is None:
            merged[window.attendance_date] = (window, list(items))
            continue

        kept, punches = existing
        # Prefer the window that actually spans a shift over the fallback.
        if kept.shift is None and window.shift is not None:
            kept = window
        merged[window.attendance_date] = (kept, punches + list(items))

    return [merged[day] for day in sorted(merged)]


def summarise(
    window: ShiftWindow,
    punches: list[AttendancePunch],
    tz: ZoneInfo,
    all_shifts: list[Shift] | None = None,
    policy: Policy | None = None,
) -> DayResult:
    policy = policy or Policy()
    shift = window.shift
    result = DayResult(
        attendance_date=window.attendance_date,
        shift_id=shift.id if shift else None,
        punch_ids=[p.id for p in punches if p.id],
        has_manual_punch=any(p.source == "manual" for p in punches),
    )

    sessions = pair_punches(punches, policy.round_punch_minutes)
    if not sessions:
        # A lone punch still proves attendance, even if hours can't be computed.
        if punches:
            result.first_in = punches[0].punch_at
            result.status = STATUS_HALF_DAY
            result.remarks = "Missing out punch"
        return result

    result.first_in = sessions[0][0]
    result.last_out = sessions[-1][1]

    worked = sum(
        int((out - inn).total_seconds() // 60) for inn, out in sessions if out > inn
    )

    if shift and worked >= shift.half_day_minutes:
        # Gaps between sessions are break already taken off the clock. Only
        # deduct the shortfall, otherwise punching out for lunch is counted
        # against the employee twice.
        #
        # Nobody takes a lunch break on a short visit, so the deduction only
        # applies once they have stayed at least half a day — otherwise an
        # hour on site comes out as zero worked.
        gaps = sum(
            int((sessions[i + 1][0] - sessions[i][1]).total_seconds() // 60)
            for i in range(len(sessions) - 1)
        )
        worked = max(worked - max(shift.break_minutes - gaps, 0), 0)

    result.worked_minutes = worked

    if not shift:
        result.status = STATUS_PRESENT if worked else STATUS_ABSENT
        return result

    first_in_local = result.first_in.astimezone(tz)
    last_out_local = result.last_out.astimezone(tz)

    late = int((first_in_local - window.start).total_seconds() // 60)
    result.late_minutes = max(late - shift.grace_in_minutes, 0)

    early = int((window.end - last_out_local).total_seconds() // 60)
    result.early_exit_minutes = max(early - shift.grace_out_minutes, 0)

    # Worked past the end of the shift: everything beyond the grace counts.
    spill = int((last_out_local - window.end).total_seconds() // 60)
    if spill > shift.grace_out_minutes:
        result.is_continued = True
        result.continued_minutes = spill
        result.continued_into_shift_id = overlapping_shift(
            last_out_local, shift.id, all_shifts or [], tz
        )

        # The continuation is always recorded; whether it is *paid* as
        # overtime is policy, and short spills can be ignored entirely.
        if (
            policy.overtime_enabled
            and policy.continuation_counts_as_overtime
            and spill >= policy.overtime_min_minutes
        ):
            result.overtime_minutes = min(
                spill, policy.overtime_max_minutes_per_day
            )

    if worked >= shift.full_day_minutes:
        result.status = STATUS_PRESENT
    elif worked >= shift.half_day_minutes:
        result.status = STATUS_HALF_DAY
    else:
        result.status = STATUS_ABSENT if worked == 0 else STATUS_HALF_DAY

    return result


def is_weekly_off(shift: Shift | None, day: date) -> bool:
    if not shift:
        return False
    return day.weekday() in (shift.weekly_offs or [])

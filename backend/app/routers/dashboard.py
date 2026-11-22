"""Everything the admin dashboard shows, in one call.

Each widget is a small indexed aggregate rather than a row scan, so the page
costs a handful of cheap queries instead of one per card.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Admin,
    AttendanceDay,
    AttendancePunch,
    Department,
    Employee,
    EmployeeShift,
    Holiday,
    LeaveRequest,
    PayrollRun,
    Shift,
)
from app.routers.auth import current_admin
from app.schemas import DashboardOut
from app.services import attendance_service as svc

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

TREND_DAYS = 14
ZERO = Decimal("0")


def month_start(day: date) -> date:
    return day.replace(day=1)


def pct(part: int | Decimal, whole: int | Decimal) -> float:
    """Percentage, rounded to one place. Zero when there is nothing to divide."""
    whole = Decimal(whole or 0)
    if whole <= 0:
        return 0.0
    return float(round(Decimal(part or 0) * 100 / whole, 1))


def headcount(db: Session, today: date) -> dict:
    active = db.scalar(
        select(func.count(Employee.id)).where(Employee.status == "active")
    )
    start = month_start(today)

    joined = db.scalar(
        select(func.count(Employee.id)).where(
            Employee.date_of_joining >= start, Employee.date_of_joining <= today
        )
    )
    exits = db.scalar(
        select(func.count(Employee.id)).where(
            Employee.date_of_exit.is_not(None),
            Employee.date_of_exit >= start,
            Employee.date_of_exit <= today,
        )
    )
    probation = db.scalar(
        select(func.count(Employee.id)).where(
            Employee.status == "active",
            Employee.probation_end_date.is_not(None),
            Employee.probation_end_date >= today,
        )
    )
    return {
        "active": active or 0,
        "joined_this_month": joined or 0,
        "exits_this_month": exits or 0,
        "on_probation": probation or 0,
    }


def leave_spans_on(db: Session, day: date, exclude_marked: bool = False) -> int:
    """Approved leave covering a date — leave is stored as a span, not per day.

    Approving leave also writes an `on_leave` attendance row, so counting both
    sources would double up. `exclude_marked` drops anyone who already has a
    row for the day; the caller adds the `on_leave` rows separately.
    """
    stmt = select(func.count(func.distinct(LeaveRequest.employee_id))).where(
        LeaveRequest.status == "approved",
        LeaveRequest.start_date <= day,
        LeaveRequest.end_date >= day,
    )
    if exclude_marked:
        marked = select(AttendanceDay.id).where(
            AttendanceDay.attendance_date == day,
            AttendanceDay.employee_id == LeaveRequest.employee_id,
        )
        stmt = stmt.where(~marked.exists())
    return db.scalar(stmt) or 0


def attendance_today(db: Session, today: date, active: int) -> dict:
    rows = db.execute(
        select(
            AttendanceDay.status,
            func.count(AttendanceDay.id),
            func.count(case((AttendanceDay.late_minutes > 0, 1))),
            func.coalesce(func.sum(AttendanceDay.overtime_minutes), 0),
        )
        .where(AttendanceDay.attendance_date == today)
        .group_by(AttendanceDay.status)
    ).all()

    by_status = {status: count for status, count, _, _ in rows}
    late = sum(r[2] for r in rows)
    overtime = sum(int(r[3]) for r in rows)

    present = by_status.get("present", 0)
    half_day = by_status.get("half_day", 0)
    absent = by_status.get("absent", 0)
    weekly_off = by_status.get("weekly_off", 0)
    holiday = by_status.get("holiday", 0)
    leave = by_status.get("on_leave", 0) + leave_spans_on(db, today, True)

    # Only people who were meant to work count towards the rate.
    expected = max(present + half_day + absent + leave, 0)

    return {
        "present": present,
        "half_day": half_day,
        "absent": absent,
        "weekly_off": weekly_off,
        "holiday": holiday,
        "on_leave": leave,
        "late": late,
        "overtime_hours": round(overtime / 60, 1),
        # Rows the engine left open because the shift has not ended, plus
        # anyone with no row at all.
        "not_marked": by_status.get("not_marked", 0)
        + max(active - sum(by_status.values()), 0),
        "expected": expected,
        "rate": pct(present + Decimal("0.5") * half_day, expected),
    }


def attendance_trend(db: Session, today: date) -> list[dict]:
    first = today - timedelta(days=TREND_DAYS - 1)

    rows = db.execute(
        select(
            AttendanceDay.attendance_date,
            AttendanceDay.status,
            func.count(AttendanceDay.id),
        )
        .where(
            AttendanceDay.attendance_date >= first,
            AttendanceDay.attendance_date <= today,
        )
        .group_by(AttendanceDay.attendance_date, AttendanceDay.status)
    ).all()

    buckets: dict[date, dict[str, int]] = {}
    for day, status, count in rows:
        buckets.setdefault(day, {})[status] = count

    # Who already has a row on each day, so span-based leave does not count
    # anyone twice — approving leave writes an `on_leave` row of its own.
    marked: dict[date, set[int]] = {}
    for day, employee_id in db.execute(
        select(AttendanceDay.attendance_date, AttendanceDay.employee_id).where(
            AttendanceDay.attendance_date >= first,
            AttendanceDay.attendance_date <= today,
        )
    ).all():
        marked.setdefault(day, set()).add(employee_id)

    leave_rows = db.execute(
        select(
            LeaveRequest.employee_id, LeaveRequest.start_date, LeaveRequest.end_date
        ).where(
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= today,
            LeaveRequest.end_date >= first,
        )
    ).all()

    out = []
    for offset in range(TREND_DAYS):
        day = first + timedelta(days=offset)
        counts = buckets.get(day, {})
        present = counts.get("present", 0)
        half_day = counts.get("half_day", 0)
        absent = counts.get("absent", 0)
        seen = marked.get(day, set())
        leave = counts.get("on_leave", 0) + len(
            {emp for emp, lo, hi in leave_rows if lo <= day <= hi and emp not in seen}
        )
        expected = present + half_day + absent + leave

        out.append(
            {
                "date": day,
                "present": present,
                "half_day": half_day,
                "absent": absent,
                "on_leave": leave,
                "weekly_off": counts.get("weekly_off", 0),
                "holiday": counts.get("holiday", 0),
                "rate": pct(present + Decimal("0.5") * half_day, expected),
            }
        )
    return out


def departments(db: Session) -> list[dict]:
    rows = db.execute(
        select(
            func.coalesce(Department.name, "Unassigned"),
            func.count(Employee.id),
        )
        .select_from(Employee)
        .outerjoin(Department, Employee.department_id == Department.id)
        .where(Employee.status == "active")
        .group_by(Department.name)
        .order_by(func.count(Employee.id).desc())
    ).all()

    total = sum(count for _, count in rows)
    return [
        {"name": name, "count": count, "pct": pct(count, total)}
        for name, count in rows
    ]


def shift_coverage(db: Session, today: date) -> list[dict]:
    """Who is rostered on each shift today, and how many actually turned up."""
    assigned = db.execute(
        select(
            Shift.id,
            Shift.name,
            Shift.code,
            Shift.start_time,
            Shift.end_time,
            func.count(func.distinct(EmployeeShift.employee_id)),
        )
        .select_from(EmployeeShift)
        .join(Shift, EmployeeShift.shift_id == Shift.id)
        .where(
            EmployeeShift.effective_from <= today,
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= today,
            ),
        )
        .group_by(Shift.id, Shift.name, Shift.code, Shift.start_time, Shift.end_time)
        .order_by(Shift.start_time)
    ).all()

    present_rows = db.execute(
        select(AttendanceDay.shift_id, func.count(AttendanceDay.id)).where(
            AttendanceDay.attendance_date == today,
            AttendanceDay.status.in_(("present", "half_day")),
        )
        .group_by(AttendanceDay.shift_id)
    ).all()
    present_by_shift = {shift_id: count for shift_id, count in present_rows}

    return [
        {
            "shift_id": shift_id,
            "name": name,
            "code": code,
            "start_time": start,
            "end_time": end,
            "assigned": count,
            "present": present_by_shift.get(shift_id, 0),
            "pct": pct(present_by_shift.get(shift_id, 0), count),
        }
        for shift_id, name, code, start, end, count in assigned
    ]


def leave_block(db: Session, today: date) -> dict:
    pending_count = (
        db.scalar(
            select(func.count(LeaveRequest.id)).where(LeaveRequest.status == "pending")
        )
        or 0
    )

    rows = db.scalars(
        select(LeaveRequest)
        .where(LeaveRequest.status == "pending")
        .order_by(LeaveRequest.created_at.desc())
        .limit(6)
    ).unique()

    return {
        "pending_count": pending_count,
        "pending": [
            {
                "id": r.id,
                "employee_name": r.employee.full_name if r.employee else None,
                "employee_code": r.employee.employee_code if r.employee else None,
                "leave_type": r.leave_type.name if r.leave_type else None,
                "start_date": r.start_date,
                "end_date": r.end_date,
                "days": r.days,
                "applied_on": r.created_at.date(),
                "starts_in_days": (r.start_date - today).days,
            }
            for r in rows
        ],
    }


def payroll_block(db: Session) -> dict:
    runs = db.scalars(
        select(PayrollRun).order_by(PayrollRun.period.desc()).limit(2)
    ).all()
    if not runs:
        return {
            "period": None,
            "status": None,
            "total_net": ZERO,
            "total_gross": ZERO,
            "employee_count": 0,
            "change_pct": None,
        }

    latest = runs[0]
    previous = runs[1] if len(runs) > 1 else None
    change = None
    if previous and previous.total_net:
        change = float(
            round(
                (latest.total_net - previous.total_net) * 100 / previous.total_net, 1
            )
        )

    return {
        "period": latest.period,
        "status": latest.status,
        "total_net": latest.total_net,
        "total_gross": latest.total_gross,
        "employee_count": latest.employee_count,
        "change_pct": change,
    }


def upcoming_holidays(db: Session, today: date) -> list[dict]:
    rows = db.scalars(
        select(Holiday)
        .where(Holiday.holiday_date >= today)
        .order_by(Holiday.holiday_date)
        .limit(4)
    ).all()
    return [
        {
            "name": h.name,
            "holiday_date": h.holiday_date,
            "kind": h.kind,
            "days_away": (h.holiday_date - today).days,
        }
        for h in rows
    ]


def recent_joiners(db: Session, today: date) -> list[dict]:
    rows = db.scalars(
        select(Employee)
        .where(Employee.date_of_joining <= today, Employee.status == "active")
        .order_by(Employee.date_of_joining.desc())
        .limit(5)
    ).all()
    return [
        {
            "id": e.id,
            "name": e.full_name,
            "employee_code": e.employee_code,
            "department": e.department_ref.name if e.department_ref else None,
            "date_of_joining": e.date_of_joining,
            "days_ago": (today - e.date_of_joining).days,
        }
        for e in rows
    ]


def celebrations(db: Session, today: date) -> list[dict]:
    """Birthdays and work anniversaries inside the next fortnight.

    Compared on month and day so the stored year is irrelevant, and the window
    is built from the actual dates so it crosses into January correctly.
    """
    horizon = [today + timedelta(days=i) for i in range(15)]
    wanted = {(d.month, d.day): d for d in horizon}

    rows = db.scalars(
        select(Employee).where(
            Employee.status == "active",
            or_(
                Employee.date_of_birth.is_not(None),
                Employee.date_of_joining.is_not(None),
            ),
        )
    ).all()

    out = []
    for e in rows:
        if e.date_of_birth and (e.date_of_birth.month, e.date_of_birth.day) in wanted:
            when = wanted[(e.date_of_birth.month, e.date_of_birth.day)]
            out.append(
                {
                    "employee_id": e.id,
                    "name": e.full_name,
                    "employee_code": e.employee_code,
                    "kind": "birthday",
                    "on_date": when,
                    "years": None,
                }
            )

        doj = e.date_of_joining
        if doj and (doj.month, doj.day) in wanted:
            when = wanted[(doj.month, doj.day)]
            years = when.year - doj.year
            if years >= 1:
                out.append(
                    {
                        "employee_id": e.id,
                        "name": e.full_name,
                        "employee_code": e.employee_code,
                        "kind": "anniversary",
                        "on_date": when,
                        "years": years,
                    }
                )

    out.sort(key=lambda c: (c["on_date"], c["name"] or ""))
    return out[:6]


def recent_punches(db: Session, today: date) -> list[dict]:
    """The last few punches of the day — the closest thing to a live feed."""
    zone = svc.tz()
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=zone)
    end = start + timedelta(days=1)

    rows = db.scalars(
        select(AttendancePunch)
        .where(AttendancePunch.punch_at >= start, AttendancePunch.punch_at < end)
        .order_by(AttendancePunch.punch_at.desc())
        .limit(8)
    ).all()

    employees = {
        e.id: e
        for e in db.scalars(
            select(Employee).where(Employee.id.in_([p.employee_id for p in rows]))
        )
    }

    return [
        {
            "id": p.id,
            "employee_name": (
                employees[p.employee_id].full_name
                if p.employee_id in employees
                else None
            ),
            "employee_code": (
                employees[p.employee_id].employee_code
                if p.employee_id in employees
                else None
            ),
            "punch_at": p.punch_at.astimezone(zone),
            "direction": p.direction,
            "source": p.source,
        }
        for p in rows
    ]


def missing_payroll_data(db: Session) -> int:
    """Active employees with no CTC — they would be paid nothing."""
    return (
        db.scalar(
            select(func.count(Employee.id)).where(
                Employee.status == "active",
                or_(Employee.ctc_annual.is_(None), Employee.ctc_annual == 0),
            )
        )
        or 0
    )


@router.get("", response_model=DashboardOut)
def overview(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    today = datetime.now(svc.tz()).date()
    people = headcount(db, today)

    return DashboardOut(
        today=today,
        headcount=people,
        attendance=attendance_today(db, today, people["active"]),
        trend=attendance_trend(db, today),
        departments=departments(db),
        shifts=shift_coverage(db, today),
        leave=leave_block(db, today),
        payroll=payroll_block(db),
        holidays=upcoming_holidays(db, today),
        joiners=recent_joiners(db, today),
        celebrations=celebrations(db, today),
        punches=recent_punches(db, today),
        without_salary=missing_payroll_data(db),
    )

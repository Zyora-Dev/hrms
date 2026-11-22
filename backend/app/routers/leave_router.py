from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import events, mailer
from app.db import get_db
from app.models import (
    Admin,
    AttendanceDay,
    Employee,
    EmployeeShift,
    Holiday,
    LeaveRequest,
    LeaveType,
)
from app.routers.auth import current_admin
from app.schemas import (
    EmployeeLeaveBalances,
    LeaveBalanceOut,
    LeaveDecision,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveRequestPage,
)

router = APIRouter(prefix="/leave", tags=["leave"])

ZERO = Decimal("0")


def shift_for(db: Session, employee_id: int, day: date):
    row = db.scalar(
        select(EmployeeShift)
        .where(
            EmployeeShift.employee_id == employee_id,
            EmployeeShift.effective_from <= day,
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= day,
            ),
        )
        .order_by(EmployeeShift.effective_from.desc())
        .limit(1)
    )
    return row.shift if row else None


def holiday_dates(
    db: Session, start: date, end: date, location: str | None
) -> set[date]:
    """Dates already free, so leave is not consumed for them."""
    rows = db.scalars(
        select(Holiday).where(
            Holiday.holiday_date >= start,
            Holiday.holiday_date <= end,
            Holiday.is_paid.is_(True),
        )
    )
    out: set[date] = set()
    for row in rows:
        if not row.location or (
            location and row.location.strip().lower() == location.strip().lower()
        ):
            out.add(row.holiday_date)
    return out


def working_days(
    db: Session, employee_id: int, start: date, end: date, half: bool
) -> tuple[Decimal, list[date]]:
    """Count leave days, skipping weekly offs and holidays.

    Charging leave for a day the office is already closed would quietly cost
    the employee a day of balance.
    """
    if half:
        return Decimal("0.5"), [start]

    employee = db.get(Employee, employee_id)
    holidays = holiday_dates(
        db, start, end, employee.work_location if employee else None
    )

    days = ZERO
    dates: list[date] = []
    current = start
    while current <= end:
        shift = shift_for(db, employee_id, current)
        weekly_off = bool(shift) and current.weekday() in (shift.weekly_offs or [])

        if not weekly_off and current not in holidays:
            days += 1
            dates.append(current)
        current += timedelta(days=1)
    return days, dates


def to_out(row: LeaveRequest) -> LeaveRequestOut:
    out = LeaveRequestOut.model_validate(row)
    if row.employee:
        out.employee_name = row.employee.full_name
        out.employee_code = row.employee.employee_code
    if row.leave_type:
        out.leave_type_name = row.leave_type.name
        out.leave_type_code = row.leave_type.code
        out.is_paid = row.leave_type.is_paid
    return out


def taken_days(
    db: Session,
    employee_id: int,
    leave_type_id: int,
    year_start: date,
    year_end: date,
    statuses: tuple[str, ...],
    exclude_id: int | None = None,
) -> Decimal:
    stmt = select(func.coalesce(func.sum(LeaveRequest.days), 0)).where(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.leave_type_id == leave_type_id,
        LeaveRequest.status.in_(statuses),
        LeaveRequest.start_date >= year_start,
        LeaveRequest.start_date <= year_end,
    )
    if exclude_id is not None:
        stmt = stmt.where(LeaveRequest.id != exclude_id)
    return Decimal(db.scalar(stmt) or 0)


def entitlement(leave_type: LeaveType, employee: Employee, as_of: date) -> Decimal:
    """Accrual earned so far this calendar year, capped by the annual cap."""
    start_month = 1
    if employee.date_of_joining and employee.date_of_joining.year == as_of.year:
        start_month = employee.date_of_joining.month

    months = max(as_of.month - start_month + 1, 0)
    earned = Decimal(leave_type.monthly_accrual) * months

    if leave_type.annual_cap is not None:
        earned = min(earned, Decimal(leave_type.annual_cap))
    return earned


def balances_for(
    db: Session, employee: Employee, as_of: date
) -> list[LeaveBalanceOut]:
    year_start = date(as_of.year, 1, 1)
    year_end = date(as_of.year, 12, 31)

    out: list[LeaveBalanceOut] = []
    for leave_type in db.scalars(
        select(LeaveType).where(LeaveType.is_active.is_(True)).order_by(LeaveType.code)
    ):
        if leave_type.applies_to != "all" and employee.gender != leave_type.applies_to:
            continue

        entitled = entitlement(leave_type, employee, as_of)
        used = taken_days(
            db, employee.id, leave_type.id, year_start, year_end, ("approved",)
        )
        pending = taken_days(
            db, employee.id, leave_type.id, year_start, year_end, ("pending",)
        )

        out.append(
            LeaveBalanceOut(
                leave_type_id=leave_type.id,
                code=leave_type.code,
                name=leave_type.name,
                entitled=entitled,
                used=used,
                pending=pending,
                available=entitled - used - pending,
                carry_forward=leave_type.carry_forward,
                encash_unused=leave_type.encash_unused,
            )
        )
    return out


def mark_attendance(
    db: Session, request: LeaveRequest, clear: bool = False
) -> None:
    """Reflect approved leave on the attendance day, so payroll counts it.

    A day with punches is left alone — if someone scanned in, they worked.
    """
    if not request.leave_type or not request.leave_type.is_paid:
        return

    _, dates = working_days(
        db,
        request.employee_id,
        request.start_date,
        request.end_date,
        request.is_half_day,
    )

    for day in dates:
        row = db.scalar(
            select(AttendanceDay).where(
                AttendanceDay.employee_id == request.employee_id,
                AttendanceDay.attendance_date == day,
            )
        )
        if clear:
            if row is not None and row.status == "on_leave":
                row.status = "absent"
            continue

        if row is None:
            shift = shift_for(db, request.employee_id, day)
            row = AttendanceDay(
                employee_id=request.employee_id,
                attendance_date=day,
                shift_id=shift.id if shift else None,
            )
            db.add(row)
        if not row.first_in:
            row.status = "on_leave"


@router.get("/requests", response_model=LeaveRequestPage)
def list_requests(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    employee_id: int | None = None,
    leave_type_id: int | None = None,
    request_status: str | None = Query(default=None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
):
    stmt = select(LeaveRequest)

    if employee_id:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    if leave_type_id:
        stmt = stmt.where(LeaveRequest.leave_type_id == leave_type_id)
    if request_status:
        stmt = stmt.where(LeaveRequest.status == request_status)
    if date_from:
        stmt = stmt.where(LeaveRequest.end_date >= date_from)
    if date_to:
        stmt = stmt.where(LeaveRequest.start_date <= date_to)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.join(Employee).where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(LeaveRequest.start_date.desc(), LeaveRequest.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()

    return LeaveRequestPage(
        items=[to_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.post(
    "/requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED
)
def create_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = db.get(Employee, payload.employee_id)
    if not employee:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Employee not found")

    leave_type = db.get(LeaveType, payload.leave_type_id)
    if not leave_type or not leave_type.is_active:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Leave type not available"
        )

    # --- policy checks ---------------------------------------------------
    if payload.is_half_day and not leave_type.allow_half_day:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{leave_type.name} cannot be taken as a half day",
        )

    if leave_type.applies_to != "all" and employee.gender != leave_type.applies_to:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{leave_type.name} does not apply to this employee",
        )

    if leave_type.applicable_after_days and employee.date_of_joining:
        eligible_on = employee.date_of_joining + timedelta(
            days=leave_type.applicable_after_days
        )
        if payload.start_date < eligible_on:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{leave_type.name} is available only from {eligible_on}",
            )

    if leave_type.min_notice_days:
        notice = (payload.start_date - date.today()).days
        if notice < leave_type.min_notice_days:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"{leave_type.name} needs {leave_type.min_notice_days} day(s) notice",
            )

    days, _dates = working_days(
        db,
        employee.id,
        payload.start_date,
        payload.end_date,
        payload.is_half_day,
    )
    if days <= ZERO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "That range is entirely weekly offs",
        )

    if (
        leave_type.max_consecutive_days is not None
        and days > Decimal(leave_type.max_consecutive_days)
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{leave_type.name} allows at most "
            f"{leave_type.max_consecutive_days} consecutive day(s)",
        )

    overlap = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.status.in_(("pending", "approved")),
            LeaveRequest.start_date <= payload.end_date,
            LeaveRequest.end_date >= payload.start_date,
        )
    )
    if overlap:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Overlaps an existing request ({overlap.start_date} – {overlap.end_date})",
        )

    if not leave_type.allow_negative_balance:
        current = balances_for(db, employee, payload.start_date)
        match = next((b for b in current if b.leave_type_id == leave_type.id), None)
        if match and days > match.available:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Only {match.available} day(s) of {leave_type.name} available",
            )

    request = LeaveRequest(
        employee_id=employee.id,
        leave_type_id=leave_type.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days=days,
        is_half_day=payload.is_half_day,
        reason=payload.reason,
        status="pending" if leave_type.requires_approval else "approved",
    )
    if request.status == "approved":
        request.decided_at = datetime.now(timezone.utc)

    db.add(request)
    db.flush()

    if request.status == "approved":
        mark_attendance(db, request)

    db.commit()
    db.refresh(request)
    return to_out(request)


@router.get("/requests/{request_id}", response_model=LeaveRequestOut)
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """One request on its own, for opening straight from a notification."""
    request = db.get(LeaveRequest, request_id)
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")
    return to_out(request)


@router.put("/requests/{request_id}", response_model=LeaveRequestOut)
def decide_request(
    request_id: int,
    payload: LeaveDecision,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    request = db.get(LeaveRequest, request_id)
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")

    was_approved = request.status == "approved"
    request.status = payload.status
    request.decision_note = payload.decision_note
    request.decided_at = datetime.now(timezone.utc)

    if payload.status == "approved" and not was_approved:
        mark_attendance(db, request)
    elif was_approved and payload.status != "approved":
        mark_attendance(db, request, clear=True)

    db.commit()
    db.refresh(request)

    config = mailer.config(db)
    if config.send_leave_decisions and request.employee:
        span = (
            f"{request.start_date:%d %b %Y}"
            if request.start_date == request.end_date
            else f"{request.start_date:%d %b} to {request.end_date:%d %b %Y}"
        )
        mailer.queue(
            db,
            kind="leave_decision",
            to_email=request.employee.work_email,
            to_name=request.employee.full_name,
            subject=f"Your leave was {request.status}",
            lines=[
                f"Hello {request.employee.full_name or ''},".strip(),
                f"Your request for {request.days} day(s) of "
                f"{request.leave_type.name if request.leave_type else 'leave'} "
                f"({span}) was <b>{request.status}</b>.",
                *([f"Note from HR: {payload.decision_note}"]
                  if payload.decision_note else []),
            ],
            action=("Open the portal", "/employee?tab=leave"),
            entity="leave_request",
            entity_id=request.id,
            commit=True,
        )

    events.publish(
        f"employee:{request.employee_id}",
        "leave_request",
        request_id=request.id,
        status=request.status,
        message=f"Your leave was {request.status}",
    )
    events.publish("admin", "leave_request", request_id=request.id)
    return to_out(request)


@router.delete("/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_request(
    request_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    request = db.get(LeaveRequest, request_id)
    if not request:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found")

    if request.status == "approved":
        mark_attendance(db, request, clear=True)

    db.delete(request)
    db.commit()


@router.get("/balances", response_model=list[EmployeeLeaveBalances])
def list_balances(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    employee_id: int | None = None,
    as_of: date | None = None,
    q: str | None = None,
):
    as_of = as_of or date.today()

    stmt = select(Employee).where(
        or_(Employee.date_of_exit.is_(None), Employee.date_of_exit >= as_of)
    )
    if employee_id:
        stmt = stmt.where(Employee.id == employee_id)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    return [
        EmployeeLeaveBalances(
            employee_id=e.id,
            employee_name=e.full_name,
            employee_code=e.employee_code,
            period=as_of,
            balances=balances_for(db, e, as_of),
        )
        for e in db.scalars(stmt.order_by(Employee.employee_code)).unique()
    ]

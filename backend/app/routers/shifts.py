from datetime import date, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, Employee, EmployeeShift, Shift
from app.routers.auth import current_admin
from app.schemas import (
    AssignmentHistoryItem,
    AssignmentHistoryPage,
    RosterEmployee,
    RosterOut,
    RosterShift,
    ShiftAssignmentCreate,
    ShiftAssignmentOut,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
)

router = APIRouter(prefix="/shifts", tags=["shifts"])


def to_out(shift: Shift, assigned: int = 0) -> ShiftOut:
    out = ShiftOut.model_validate(shift)
    out.is_overnight = shift.is_overnight
    out.duration_minutes = shift.duration_minutes
    out.paid_minutes = shift.paid_minutes
    out.continuation_window_minutes = shift.continuation_window_minutes
    out.assigned_count = assigned
    return out


def apply_defaults(shift: Shift) -> None:
    """Thresholds default to the shift's own paid duration, so an 8h shift with
    a 1h break expects 7h rather than a hardcoded 8."""
    if not shift.full_day_minutes:
        shift.full_day_minutes = shift.paid_minutes
    if not shift.half_day_minutes:
        shift.half_day_minutes = shift.paid_minutes // 2


def assignment_counts(db: Session) -> dict[int, int]:
    rows = db.execute(
        select(EmployeeShift.shift_id, func.count(func.distinct(EmployeeShift.employee_id)))
        .where(or_(EmployeeShift.effective_to.is_(None), EmployeeShift.effective_to >= func.current_date()))
        .group_by(EmployeeShift.shift_id)
    ).all()
    return {r[0]: r[1] for r in rows}


@router.get("", response_model=list[ShiftOut])
def list_shifts(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    include_inactive: bool = Query(default=False),
):
    stmt = select(Shift)
    if not include_inactive:
        stmt = stmt.where(Shift.is_active.is_(True))

    counts = assignment_counts(db)
    return [
        to_out(s, counts.get(s.id, 0))
        for s in db.scalars(stmt.order_by(Shift.start_time))
    ]


# NOTE: these must stay above "/{shift_id}", otherwise the path param
# swallows "/roster" and "/assignments".


@router.get("/roster", response_model=RosterOut)
def shift_roster(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    shift_id: int | None = None,
    department_id: int | None = None,
    employee_id: int | None = None,
    q: str | None = None,
):
    """Rotation chart: one row per employee, one cell per date.

    Cells are resolved from the assignment history, so a rotating roster shows
    the shift each person was actually on for that day — past or upcoming.
    """
    today = date.today()
    date_from = date_from or today - timedelta(days=today.weekday())
    date_to = date_to or date_from + timedelta(days=13)

    if date_to < date_from:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "date_to cannot be before date_from"
        )
    span = (date_to - date_from).days + 1
    # Generous ceiling: a roster block can be a week, a month or a quarter.
    if span > 186:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Chart a range of 186 days (about six months) or less",
        )

    dates = [date_from + timedelta(days=i) for i in range(span)]

    emp_stmt = select(Employee).where(
        or_(Employee.date_of_exit.is_(None), Employee.date_of_exit >= date_from)
    )
    if employee_id:
        emp_stmt = emp_stmt.where(Employee.id == employee_id)
    if department_id:
        emp_stmt = emp_stmt.where(Employee.department_id == department_id)
    if q:
        term = f"%{q.strip().lower()}%"
        emp_stmt = emp_stmt.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    employees = list(db.scalars(emp_stmt.order_by(Employee.employee_code)).unique())

    # Assignments overlapping the window, newest first so the latest wins.
    assign_stmt = select(EmployeeShift).where(
        EmployeeShift.employee_id.in_([e.id for e in employees] or [0]),
        EmployeeShift.effective_from <= date_to,
        or_(
            EmployeeShift.effective_to.is_(None),
            EmployeeShift.effective_to >= date_from,
        ),
    )
    by_employee: dict[int, list[EmployeeShift]] = {}
    for row in db.scalars(assign_stmt).unique():
        by_employee.setdefault(row.employee_id, []).append(row)
    for rows in by_employee.values():
        rows.sort(key=lambda r: r.effective_from, reverse=True)

    used_shift_ids: set[int] = set()
    out_employees: list[RosterEmployee] = []

    for employee in employees:
        rows = by_employee.get(employee.id, [])
        days: dict[str, int | None] = {}
        offs: list[str] = []

        for day in dates:
            match = next(
                (
                    r
                    for r in rows
                    if r.effective_from <= day
                    and (r.effective_to is None or day <= r.effective_to)
                ),
                None,
            )
            if match is None:
                days[day.isoformat()] = None
                continue

            days[day.isoformat()] = match.shift_id
            used_shift_ids.add(match.shift_id)
            if match.shift and day.weekday() in (match.shift.weekly_offs or []):
                offs.append(day.isoformat())

        if shift_id and shift_id not in {v for v in days.values() if v}:
            continue

        out_employees.append(
            RosterEmployee(
                employee_id=employee.id,
                employee_name=employee.full_name,
                employee_code=employee.employee_code,
                department=employee.department,
                designation=employee.designation,
                days=days,
                offs=offs,
            )
        )

    shifts = [
        RosterShift(
            id=s.id,
            name=s.name,
            code=s.code,
            start_time=s.start_time,
            end_time=s.end_time,
            is_overnight=s.is_overnight,
        )
        for s in db.scalars(select(Shift).order_by(Shift.start_time))
        if s.id in used_shift_ids or not used_shift_ids
    ]

    return RosterOut(
        date_from=date_from,
        date_to=date_to,
        dates=dates,
        shifts=shifts,
        employees=out_employees,
        total=len(out_employees),
    )


@router.get("/assignments/history", response_model=AssignmentHistoryPage)
def assignment_history(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    employee_id: int | None = None,
    shift_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    current_only: bool = False,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = select(EmployeeShift)

    if employee_id:
        stmt = stmt.where(EmployeeShift.employee_id == employee_id)
    if shift_id:
        stmt = stmt.where(EmployeeShift.shift_id == shift_id)
    if date_from:
        stmt = stmt.where(
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= date_from,
            )
        )
    if date_to:
        stmt = stmt.where(EmployeeShift.effective_from <= date_to)
    if current_only:
        stmt = stmt.where(
            EmployeeShift.effective_from <= func.current_date(),
            or_(
                EmployeeShift.effective_to.is_(None),
                EmployeeShift.effective_to >= func.current_date(),
            ),
        )
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

    rows = list(
        db.scalars(
            stmt.order_by(EmployeeShift.effective_from.desc(), EmployeeShift.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).unique()
    )

    today = date.today()
    items = [
        AssignmentHistoryItem(
            id=r.id,
            employee_id=r.employee_id,
            employee_name=r.employee.full_name if r.employee else "",
            employee_code=r.employee.employee_code if r.employee else "",
            shift_id=r.shift_id,
            shift_name=r.shift.name if r.shift else "",
            shift_code=r.shift.code if r.shift else "",
            effective_from=r.effective_from,
            effective_to=r.effective_to,
            is_current=r.effective_from <= today
            and (r.effective_to is None or today <= r.effective_to),
        )
        for r in rows
    ]

    return AssignmentHistoryPage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.post("", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    clash = db.scalar(
        select(Shift).where(
            or_(
                func.lower(Shift.name) == payload.name.lower(),
                Shift.code == payload.code,
            )
        )
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A shift with that name or code already exists"
        )

    shift = Shift(**payload.model_dump())
    apply_defaults(shift)
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return to_out(shift)


@router.get("/{shift_id}", response_model=ShiftOut)
def read_shift(
    shift_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")
    return to_out(shift, assignment_counts(db).get(shift.id, 0))


@router.put("/{shift_id}", response_model=ShiftOut)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")

    clash = db.scalar(
        select(Shift).where(
            Shift.id != shift_id,
            or_(
                func.lower(Shift.name) == payload.name.lower(),
                Shift.code == payload.code,
            ),
        )
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another shift already uses that name or code"
        )

    for field, value in payload.model_dump().items():
        setattr(shift, field, value)
    apply_defaults(shift)

    db.commit()
    db.refresh(shift)
    return to_out(shift, assignment_counts(db).get(shift.id, 0))


@router.delete("/{shift_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shift(
    shift_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    shift = db.get(Shift, shift_id)
    if not shift:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shift not found")

    used = db.scalar(
        select(func.count()).select_from(EmployeeShift).where(
            EmployeeShift.shift_id == shift_id
        )
    )
    if used:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This shift has {used} assignment(s). Deactivate it instead.",
        )

    db.delete(shift)
    db.commit()


# --------------------------------------------------------------------------
# Assignments
# --------------------------------------------------------------------------


@router.get("/{shift_id}/assignments", response_model=list[ShiftAssignmentOut])
def list_assignments(
    shift_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    rows = db.scalars(
        select(EmployeeShift)
        .where(EmployeeShift.shift_id == shift_id)
        .order_by(EmployeeShift.effective_from.desc())
    ).unique()

    return [
        ShiftAssignmentOut(
            id=a.id,
            employee_id=a.employee_id,
            employee_name=a.employee.full_name if a.employee else None,
            employee_code=a.employee.employee_code if a.employee else None,
            shift_id=a.shift_id,
            shift_name=a.shift.name if a.shift else None,
            effective_from=a.effective_from,
            effective_to=a.effective_to,
        )
        for a in rows
    ]


@router.post(
    "/assignments",
    response_model=list[ShiftAssignmentOut],
    status_code=status.HTTP_201_CREATED,
)
def assign_shift(
    payload: ShiftAssignmentCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    shift = db.get(Shift, payload.shift_id)
    if not shift:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Shift not found")

    created = []
    for employee_id in payload.employee_ids:
        employee = db.get(Employee, employee_id)
        if not employee:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Employee {employee_id} not found",
            )

        # Close any assignment still open on the new start date, so an employee
        # is never on two shifts at once.
        open_rows = db.scalars(
            select(EmployeeShift).where(
                EmployeeShift.employee_id == employee_id,
                or_(
                    EmployeeShift.effective_to.is_(None),
                    EmployeeShift.effective_to >= payload.effective_from,
                ),
            )
        ).unique()
        for row in open_rows:
            if row.effective_from >= payload.effective_from:
                db.delete(row)  # fully superseded
            else:
                row.effective_to = payload.effective_from - timedelta(days=1)

        assignment = EmployeeShift(
            employee_id=employee_id,
            shift_id=payload.shift_id,
            effective_from=payload.effective_from,
            effective_to=payload.effective_to,
        )
        db.add(assignment)
        created.append(assignment)

    db.commit()
    for a in created:
        db.refresh(a)

    return [
        ShiftAssignmentOut(
            id=a.id,
            employee_id=a.employee_id,
            employee_name=a.employee.full_name if a.employee else None,
            employee_code=a.employee.employee_code if a.employee else None,
            shift_id=a.shift_id,
            shift_name=shift.name,
            effective_from=a.effective_from,
            effective_to=a.effective_to,
        )
        for a in created
    ]


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(EmployeeShift, assignment_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found")
    db.delete(row)
    db.commit()

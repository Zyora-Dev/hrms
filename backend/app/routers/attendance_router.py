import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from math import ceil

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Admin,
    AttendanceDay,
    AttendanceRegularisation,
    AttendancePunch,
    Employee,
    LeaveRequest,
    PayrollRun,
    Shift,
)
from app.routers.auth import current_admin
from app.schemas import (
    AttendanceDayOut,
    AttendanceMatrix,
    AttendancePage,
    AttendanceSummary,
    ContinuationUpdate,
    DayRoster,
    DayRosterEntry,
    DayStatusUpdate,
    MatrixCell,
    MatrixRow,
    RegularisationDecision,
    RegularisationOut,
    PunchBatch,
    PunchIn,
    PunchIngestResult,
    PunchOut,
    RecomputeRequest,
    RecomputeResult,
)
from app import attendance as engine
from app import audit, events
from app.notifications import notify
from app.services import attendance_service as svc

router = APIRouter(prefix="/attendance", tags=["attendance"])


def resolve_employee(db: Session, punch: PunchIn) -> Employee | None:
    if punch.employee_id is not None:
        return db.get(Employee, punch.employee_id)
    return db.scalar(
        select(Employee).where(
            func.lower(Employee.employee_code) == (punch.employee_code or "").lower()
        )
    )


def store_punches(db: Session, items: list[PunchIn]) -> PunchIngestResult:
    """Insert punches, skip exact duplicates, then recompute affected days."""
    stored = duplicates = 0
    unmatched: list[str] = []
    dirty: dict[int, tuple[date, date]] = {}

    for item in items:
        employee = resolve_employee(db, item)
        if not employee:
            label = item.employee_code or f"id:{item.employee_id}"
            if label not in unmatched:
                unmatched.append(label)
            continue

        exists = db.scalar(
            select(AttendancePunch).where(
                AttendancePunch.employee_id == employee.id,
                AttendancePunch.punch_at == item.punch_at,
                AttendancePunch.external_id == item.external_id,
            )
        )
        if exists:
            duplicates += 1
            continue

        db.add(
            AttendancePunch(
                employee_id=employee.id,
                punch_at=item.punch_at,
                direction=item.direction,
                source=item.source,
                device_id=item.device_id,
                external_id=item.external_id,
                note=item.note,
            )
        )
        stored += 1

        lo, hi = svc.affected_dates(item.punch_at)
        if employee.id in dirty:
            prev = dirty[employee.id]
            dirty[employee.id] = (min(prev[0], lo), max(prev[1], hi))
        else:
            dirty[employee.id] = (lo, hi)

    db.commit()

    recomputed = 0
    all_shifts = list(db.scalars(select(Shift)))
    settings_row = svc.load_settings(db)
    for employee_id, (lo, hi) in dirty.items():
        recomputed += svc.recompute_employee(
            db, employee_id, lo, hi, all_shifts, settings_row
        )

    return PunchIngestResult(
        received=len(items),
        stored=stored,
        duplicates=duplicates,
        unmatched=unmatched,
        recomputed_days=recomputed,
    )


@router.post("/punches", response_model=PunchIngestResult)
def ingest_punches(
    payload: PunchBatch,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Bulk endpoint for the biometric device (or its middleware) to post to."""
    return store_punches(db, payload.punches)


@router.post("/punches/manual", response_model=PunchIngestResult)
def manual_punch(
    payload: PunchIn,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    settings_row = svc.load_settings(db)
    if settings_row and not settings_row.allow_manual_punch:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Manual punches are turned off in attendance settings",
        )
    if (
        settings_row
        and settings_row.manual_punch_requires_reason
        and not (payload.note or "").strip()
    ):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "A reason is required for manual punches",
        )

    payload.source = "manual"
    return store_punches(db, [payload])


@router.post("/punches/import", response_model=PunchIngestResult)
def import_punches(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """CSV import for devices that only export files.

    Columns: employee_code, punch_at, [direction], [device_id], [external_id]
    """
    raw = file.file.read(5 * 1024 * 1024)
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "File must be UTF-8 encoded CSV"
        ) from None

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames or "punch_at" not in reader.fieldnames:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "CSV needs at least employee_code and punch_at columns",
        )

    zone = svc.tz()
    items: list[PunchIn] = []
    for index, row in enumerate(reader, start=2):
        value = (row.get("punch_at") or "").strip()
        if not value:
            continue
        try:
            moment = datetime.fromisoformat(value)
        except ValueError:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Row {index}: '{value}' is not a valid date-time",
            ) from None

        if moment.tzinfo is None:
            moment = moment.replace(tzinfo=zone)

        items.append(
            PunchIn(
                employee_code=(row.get("employee_code") or "").strip() or None,
                employee_id=int(row["employee_id"]) if row.get("employee_id") else None,
                punch_at=moment,
                direction=(row.get("direction") or "auto").strip().lower() or "auto",
                source="import",
                device_id=(row.get("device_id") or "").strip() or None,
                external_id=(row.get("external_id") or "").strip() or None,
            )
        )

    if not items:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No rows to import")

    return store_punches(db, items)


@router.delete("/punches/{punch_id}", response_model=PunchIngestResult)
def delete_punch(
    punch_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    punch = db.get(AttendancePunch, punch_id)
    if not punch:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Punch not found")

    employee_id = punch.employee_id
    lo, hi = svc.affected_dates(punch.punch_at)
    db.delete(punch)
    db.commit()

    days = svc.recompute_employee(db, employee_id, lo, hi)
    return PunchIngestResult(
        received=0, stored=0, duplicates=0, unmatched=[], recomputed_days=days
    )


# --------------------------------------------------------------------------
# Reading attendance
# --------------------------------------------------------------------------


def day_to_out(
    row: AttendanceDay,
    punches: list[AttendancePunch],
    shift_names: dict[int, str] | None = None,
) -> AttendanceDayOut:
    out = AttendanceDayOut.model_validate(row)
    out.employee_name = row.employee.full_name if row.employee else None
    out.employee_code = row.employee.employee_code if row.employee else None
    out.shift_name = row.shift.name if row.shift else None
    # Hours mean nothing on their own: 4 hours is half a short shift and a
    # third of a long one.
    if row.shift and row.continued_minutes:
        out.continued_shifts = (
            Decimal(row.continued_minutes) / Decimal(row.shift.duration_minutes)
        ).quantize(Decimal("0.01"))
    # Which shift a continuation ran into — the point of tracking it.
    if row.continued_into_shift_id and shift_names:
        out.continued_into_shift_name = shift_names.get(row.continued_into_shift_id)
    out.punches = [PunchOut.model_validate(p) for p in punches]
    return out


def filtered_days(
    date_from: date | None,
    date_to: date | None,
    employee_id: int | None = None,
    shift_id: int | None = None,
    attendance_status: str | None = None,
    continued_only: bool = False,
    q: str | None = None,
):
    """The register's filters as a statement, shared by the list and the export."""
    today = date.today()
    date_from = date_from or today
    date_to = date_to or date_from

    stmt = select(AttendanceDay).where(
        AttendanceDay.attendance_date >= date_from,
        AttendanceDay.attendance_date <= date_to,
    )
    if employee_id:
        stmt = stmt.where(AttendanceDay.employee_id == employee_id)
    if shift_id:
        stmt = stmt.where(AttendanceDay.shift_id == shift_id)
    if attendance_status:
        stmt = stmt.where(AttendanceDay.status == attendance_status)
    if continued_only:
        stmt = stmt.where(AttendanceDay.is_continued.is_(True))
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.join(Employee).where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )
    return stmt


@router.get("", response_model=AttendancePage)
def list_attendance(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: int | None = None,
    shift_id: int | None = None,
    attendance_status: str | None = Query(default=None, alias="status"),
    continued_only: bool = False,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = filtered_days(
        date_from,
        date_to,
        employee_id,
        shift_id,
        attendance_status,
        continued_only,
        q,
    )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    rows = list(
        db.scalars(
            stmt.order_by(
                AttendanceDay.attendance_date.desc(), AttendanceDay.employee_id
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).unique()
    )

    # Punches for the visible rows, with a day either side for night shifts.
    punches_by_employee: dict[int, list[AttendancePunch]] = {}
    if rows:
        zone = svc.tz()
        lo = min(r.attendance_date for r in rows) - timedelta(days=1)
        hi = max(r.attendance_date for r in rows) + timedelta(days=2)
        for p in db.scalars(
            select(AttendancePunch).where(
                AttendancePunch.employee_id.in_({r.employee_id for r in rows}),
                AttendancePunch.punch_at
                >= datetime.combine(lo, datetime.min.time()).replace(tzinfo=zone),
                AttendancePunch.punch_at
                <= datetime.combine(hi, datetime.min.time()).replace(tzinfo=zone),
            )
            .order_by(AttendancePunch.punch_at)
        ):
            punches_by_employee.setdefault(p.employee_id, []).append(p)

    shift_names = {
        s.id: s.name for s in db.scalars(select(Shift))
    }

    items = []
    for row in rows:
        own = [
            p
            for p in punches_by_employee.get(row.employee_id, [])
            if row.first_in
            and row.last_out
            and row.first_in <= p.punch_at <= row.last_out
        ]
        items.append(day_to_out(row, own, shift_names))

    return AttendancePage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.get("/summary", response_model=AttendanceSummary)
def attendance_summary(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
):
    today = date.today()
    date_from = date_from or today
    date_to = date_to or date_from

    base = select(AttendanceDay).where(
        AttendanceDay.attendance_date >= date_from,
        AttendanceDay.attendance_date <= date_to,
    )

    def count_where(*conditions) -> int:
        return (
            db.scalar(select(func.count()).select_from(base.where(*conditions).subquery()))
            or 0
        )

    return AttendanceSummary(
        employees=db.scalar(
            select(func.count(func.distinct(AttendanceDay.employee_id))).where(
                AttendanceDay.attendance_date >= date_from,
                AttendanceDay.attendance_date <= date_to,
            )
        )
        or 0,
        present=count_where(AttendanceDay.status == "present"),
        half_day=count_where(AttendanceDay.status == "half_day"),
        absent=count_where(AttendanceDay.status == "absent"),
        weekly_off=count_where(AttendanceDay.status == "weekly_off"),
        continued=count_where(AttendanceDay.is_continued.is_(True)),
        total_overtime_minutes=db.scalar(
            select(func.coalesce(func.sum(AttendanceDay.overtime_minutes), 0)).where(
                AttendanceDay.attendance_date >= date_from,
                AttendanceDay.attendance_date <= date_to,
            )
        )
        or 0,
    )


@router.post("/recompute", response_model=RecomputeResult)
def recompute(
    payload: RecomputeRequest,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    days, employees = svc.recompute_range(
        db, payload.date_from, payload.date_to, payload.employee_id
    )
    return RecomputeResult(days=days, employees=employees)


@router.patch("/days/{day_id}/continuation", response_model=AttendanceDayOut)
def set_continuation(
    day_id: int,
    payload: ContinuationUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Mark a day as a continued shift, or dismiss one that was derived.

    Punches drive continuation on their own — biometric and manual alike, since
    both feed the same engine. This is the escape hatch for the cases punches
    cannot show: an out-scan that never happened, or a stray scan hours later
    that looks like a spill.
    """
    row = db.get(AttendanceDay, day_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance day not found")

    row.continuation_mode = payload.mode
    row.continuation_override_minutes = (
        payload.minutes if payload.mode == "forced" else 0
    )
    row.continuation_note = payload.note
    db.flush()

    # Rebuild the day so the override and the punches agree about overtime.
    svc.recompute_employee(
        db, row.employee_id, row.attendance_date, row.attendance_date
    )
    db.refresh(row)

    shift_names = {s.id: s.name for s in db.scalars(select(Shift))}
    return day_to_out(row, [], shift_names)


def month_bounds(month: str) -> tuple[date, date]:
    try:
        year, mon = (int(part) for part in month.split("-"))
        first = date(year, mon, 1)
    except (ValueError, TypeError):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Month must look like 2026-11"
        ) from None

    last = date(year + (mon == 12), (mon % 12) + 1, 1) - timedelta(days=1)
    return first, last


@router.get("/matrix", response_model=AttendanceMatrix)
def matrix(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    month: str = Query(description="YYYY-MM"),
    shift_id: int | None = None,
    department_id: int | None = None,
    q: str | None = None,
):
    """A month per employee, one cell per day — the muster-roll view."""
    first, last = month_bounds(month)

    people = select(Employee).where(
        or_(Employee.date_of_exit.is_(None), Employee.date_of_exit >= first),
        Employee.date_of_joining <= last,
    )
    if department_id:
        people = people.where(Employee.department_id == department_id)
    if q:
        term = f"%{q.strip().lower()}%"
        people = people.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    employees = list(db.scalars(people.order_by(Employee.employee_code)).unique())
    if not employees:
        return AttendanceMatrix(month=month, days=last.day, rows=[])

    days = select(AttendanceDay).where(
        AttendanceDay.attendance_date >= first,
        AttendanceDay.attendance_date <= last,
        AttendanceDay.employee_id.in_([e.id for e in employees]),
    )
    if shift_id:
        days = days.where(AttendanceDay.shift_id == shift_id)

    shift_codes = {s.id: s.code for s in db.scalars(select(Shift))}

    by_employee: dict[int, dict[int, AttendanceDay]] = {}
    for row in db.scalars(days).unique():
        by_employee.setdefault(row.employee_id, {})[row.attendance_date.day] = row

    # A shift filter means "only people on that shift", not "everyone with
    # blank cells" — otherwise the grid fills with rows that say nothing.
    if shift_id:
        employees = [e for e in employees if by_employee.get(e.id)]

    rows = []
    for employee in employees:
        owned = by_employee.get(employee.id, {})
        cells, present, absent, leave, off = [], Decimal("0"), 0, 0, 0
        worked = overtime = continued = 0

        for day in range(1, last.day + 1):
            row = owned.get(day)
            if row is None:
                cells.append(MatrixCell(day=day))
                continue

            cells.append(
                MatrixCell(
                    day=day,
                    status=row.status,
                    worked_minutes=row.worked_minutes,
                    overtime_minutes=row.overtime_minutes,
                    late_minutes=row.late_minutes,
                    is_continued=row.is_continued,
                    continuation_mode=row.continuation_mode or "auto",
                    shift_code=shift_codes.get(row.shift_id),
                )
            )

            if row.status == "present":
                present += 1
            elif row.status == "half_day":
                present += Decimal("0.5")
            elif row.status == "absent":
                absent += 1
            elif row.status == "on_leave":
                leave += 1
            else:
                off += 1

            worked += row.worked_minutes
            overtime += row.overtime_minutes
            continued += 1 if row.is_continued else 0

        rows.append(
            MatrixRow(
                employee_id=employee.id,
                employee_name=employee.full_name,
                employee_code=employee.employee_code,
                department=(
                    employee.department_ref.name if employee.department_ref else None
                ),
                cells=cells,
                present=present,
                absent=absent,
                leave=leave,
                off=off,
                worked_minutes=worked,
                overtime_minutes=overtime,
                continued=continued,
            )
        )

    return AttendanceMatrix(month=month, days=last.day, rows=rows)


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: int | None = None,
    shift_id: int | None = None,
    attendance_status: str | None = Query(default=None, alias="status"),
    continued_only: bool = False,
    q: str | None = None,
):
    """The register as it is filtered on screen, without the paging."""
    stmt = filtered_days(
        date_from,
        date_to,
        employee_id,
        shift_id,
        attendance_status,
        continued_only,
        q,
    )
    rows = list(
        db.scalars(
            stmt.order_by(AttendanceDay.attendance_date, AttendanceDay.employee_id)
        ).unique()
    )

    zone = svc.tz()
    shift_names = {s.id: s.name for s in db.scalars(select(Shift))}

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Employee code",
            "Employee",
            "Date",
            "Shift",
            "In",
            "Out",
            "Worked (h)",
            "Late (min)",
            "Overtime (h)",
            "Status",
            "Continued",
            "Continued (min)",
            "Continued into",
            "Marked",
            "Note",
        ]
    )

    def local(value):
        return value.astimezone(zone).strftime("%Y-%m-%d %H:%M") if value else ""

    for row in rows:
        writer.writerow(
            [
                row.employee.employee_code if row.employee else "",
                row.employee.full_name if row.employee else "",
                row.attendance_date.isoformat(),
                shift_names.get(row.shift_id, ""),
                local(row.first_in),
                local(row.last_out),
                round(row.worked_minutes / 60, 2),
                row.late_minutes,
                round(row.overtime_minutes / 60, 2),
                row.status,
                "yes" if row.is_continued else "no",
                row.continued_minutes,
                shift_names.get(row.continued_into_shift_id, ""),
                row.continuation_mode,
                row.continuation_note or row.remarks or "",
            ]
        )

    stamp = f"{date_from or ''}_{date_to or ''}".strip("_") or "all"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="attendance-{stamp}.csv"'
        },
    )


@router.get("/day", response_model=DayRoster)
def day_roster(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    on: date | None = None,
    shift_id: int | None = None,
    q: str | None = None,
):
    """Everyone who should be at work on one date, marked or not.

    The register lists computed days; this lists *people*, so an employee with
    no scans yet still has a row to act on instead of quietly missing.
    """
    on = on or date.today()
    zone = svc.tz()

    people = select(Employee).where(
        Employee.status == "active",
        Employee.date_of_joining <= on,
        or_(Employee.date_of_exit.is_(None), Employee.date_of_exit >= on),
    )
    if q:
        term = f"%{q.strip().lower()}%"
        people = people.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    employees = list(db.scalars(people.order_by(Employee.employee_code)).unique())
    if not employees:
        return DayRoster(attendance_date=on, is_closed=True, entries=[])

    ids = [e.id for e in employees]
    rows = {
        row.employee_id: row
        for row in db.scalars(
            select(AttendanceDay).where(
                AttendanceDay.attendance_date == on,
                AttendanceDay.employee_id.in_(ids),
            )
        ).unique()
    }

    # A day's punches can sit on either neighbouring date for a night shift.
    lo = datetime.combine(on - timedelta(days=1), datetime.min.time()).replace(
        tzinfo=zone
    )
    hi = datetime.combine(on + timedelta(days=2), datetime.min.time()).replace(
        tzinfo=zone
    )
    punches: dict[int, list[AttendancePunch]] = {}
    for punch in db.scalars(
        select(AttendancePunch)
        .where(
            AttendancePunch.employee_id.in_(ids),
            AttendancePunch.punch_at >= lo,
            AttendancePunch.punch_at < hi,
        )
        .order_by(AttendancePunch.punch_at)
    ):
        punches.setdefault(punch.employee_id, []).append(punch)

    shift_names = {s.id: s.name for s in db.scalars(select(Shift))}
    closed = True
    entries = []

    for employee in employees:
        row = rows.get(employee.id)
        shift = svc.shift_resolver(db, employee.id)(on)
        if shift_id and (shift.id if shift else None) != shift_id:
            continue
        if not svc.day_is_over(on, shift, zone):
            closed = False

        # Anything scanned on the date itself, plus whatever the day's own
        # span claims — a night shift's scans land on the next morning, and a
        # day still in progress has no closing time to bound them with.
        own = [
            p
            for p in punches.get(employee.id, [])
            if p.punch_at.astimezone(zone).date() == on
            or (
                row is not None
                and row.first_in
                and row.last_out
                and row.first_in <= p.punch_at <= row.last_out
            )
        ]

        entries.append(
            DayRosterEntry(
                employee_id=employee.id,
                employee_name=employee.full_name,
                employee_code=employee.employee_code,
                department=(
                    employee.department_ref.name if employee.department_ref else None
                ),
                shift_id=shift.id if shift else None,
                shift_name=shift.name if shift else None,
                shift_window=(
                    f"{shift.start_time:%H:%M}–{shift.end_time:%H:%M}" if shift else None
                ),
                day=day_to_out(row, own, shift_names) if row else None,
                status=row.status if row else "not_marked",
                is_overridden=bool(row and row.status_override),
                punches=[PunchOut.model_validate(p) for p in own],
            )
        )

    return DayRoster(attendance_date=on, is_closed=closed, entries=entries)


@router.put("/day/status", response_model=DayRosterEntry)
def set_day_status(
    payload: DayStatusUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Mark a day by hand, or hand it back to the punches with `status: null`.

    Works whether or not the day has been computed yet, so a status can be set
    before anyone has scanned.
    """
    employee = db.get(Employee, payload.employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    row = db.scalar(
        select(AttendanceDay).where(
            AttendanceDay.employee_id == payload.employee_id,
            AttendanceDay.attendance_date == payload.attendance_date,
        )
    )
    if row is None:
        row = AttendanceDay(
            employee_id=payload.employee_id,
            attendance_date=payload.attendance_date,
            status=engine.STATUS_NOT_MARKED,
        )
        db.add(row)

    if payload.status is None and row.status == engine.STATUS_ON_LEAVE:
        # `on_leave` is sticky through recompute because the engine cannot
        # re-derive it. Clearing an override that happened to be leave must
        # not leave that stickiness behind — unless the leave is real.
        approved = db.scalar(
            select(LeaveRequest.id).where(
                LeaveRequest.employee_id == payload.employee_id,
                LeaveRequest.status == "approved",
                LeaveRequest.start_date <= payload.attendance_date,
                LeaveRequest.end_date >= payload.attendance_date,
            )
        )
        if not approved:
            row.status = engine.STATUS_NOT_MARKED

    row.status_override = payload.status
    row.status_note = payload.note
    db.flush()

    # Rebuild so the override lands on top of whatever the punches say.
    svc.recompute_employee(
        db, payload.employee_id, payload.attendance_date, payload.attendance_date
    )

    roster = day_roster(
        db=db, _=_, on=payload.attendance_date, shift_id=None, q=None
    )
    for entry in roster.entries:
        if entry.employee_id == payload.employee_id:
            return entry

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Day not found after saving")


@router.delete("/days/{day_id}", response_model=DayRosterEntry)
def clear_day(
    day_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    keep_punches: bool = False,
):
    """Wipe a day back to nothing — its punches, its marks and its totals.

    Deleting only the computed row would achieve nothing: the next recompute
    rebuilds it from the punches. So the punches go too, unless asked to keep
    them, in which case the day is simply rebuilt from them.
    """
    row = db.get(AttendanceDay, day_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance day not found")

    employee_id = row.employee_id
    day = row.attendance_date

    # A paid month is a record of what was paid; rewriting its attendance
    # would leave the payslips unexplainable.
    run = db.scalar(
        select(PayrollRun).where(
            PayrollRun.period == day.replace(day=1),
            PayrollRun.status.in_(("approved", "paid")),
        )
    )
    if run:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Payroll for {day:%B %Y} is already {run.status}. "
            "Reopen the pay run before changing its attendance.",
        )

    if not keep_punches:
        for punch in svc.punches_claimed_by(db, employee_id, day):
            db.delete(punch)

    db.delete(row)
    db.commit()

    # A night shift's scans sit on the neighbouring date, so rebuild either
    # side of the day as well.
    svc.recompute_employee(
        db, employee_id, day - timedelta(days=1), day + timedelta(days=1)
    )

    roster = day_roster(db=db, _=_, on=day, shift_id=None, q=None)
    for entry in roster.entries:
        if entry.employee_id == employee_id:
            return entry

    raise HTTPException(status.HTTP_404_NOT_FOUND, "Day not found after clearing")


# --------------------------------------------------------------------------
# Regularisation — the admin's side
# --------------------------------------------------------------------------


def regularisation_out(row: AttendanceRegularisation) -> RegularisationOut:
    out = RegularisationOut.model_validate(row)
    if row.employee:
        out.employee_code = row.employee.employee_code
        out.employee_name = row.employee.full_name
    return out


@router.get("/regularisations", response_model=list[RegularisationOut])
def list_regularisations(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    request_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = None,
):
    stmt = select(AttendanceRegularisation)
    if request_status:
        stmt = stmt.where(AttendanceRegularisation.status == request_status)
    if employee_id:
        stmt = stmt.where(AttendanceRegularisation.employee_id == employee_id)

    rows = db.scalars(
        stmt.order_by(AttendanceRegularisation.created_at.desc())
    ).unique()
    return [regularisation_out(r) for r in rows]


@router.get("/regularisations/{request_id}", response_model=RegularisationOut)
def get_regularisation(
    request_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(AttendanceRegularisation, request_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    return regularisation_out(row)


@router.put("/regularisations/{request_id}", response_model=RegularisationOut)
def decide_regularisation(
    request_id: int,
    payload: RegularisationDecision,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Approving applies the correction the employee asked for.

    Times become manual punches, so the engine works out the hours itself; a
    requested status becomes an override, which is what an admin marking the
    day by hand would have done.
    """
    row = db.get(AttendanceRegularisation, request_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if row.status != "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This request was already {row.status}"
        )

    row.status = payload.status
    row.decision_note = payload.note
    row.decided_at = datetime.now(timezone.utc)
    row.decided_by = admin.email

    if payload.status == "approved":
        zone = svc.tz()
        punches: list[PunchIn] = []
        for at, direction in (
            (row.requested_in, "in"),
            (row.requested_out, "out"),
        ):
            if at is None:
                continue
            punches.append(
                PunchIn(
                    employee_id=row.employee_id,
                    punch_at=datetime.combine(row.attendance_date, at).replace(
                        tzinfo=zone
                    ),
                    direction=direction,
                    source="manual",
                    note=f"Regularised: {row.reason}"[:255],
                )
            )
        if punches:
            store_punches(db, punches)

        if row.requested_status:
            set_day_status(
                DayStatusUpdate(
                    employee_id=row.employee_id,
                    attendance_date=row.attendance_date,
                    status=row.requested_status,
                    note=f"Regularised: {row.reason}"[:255],
                ),
                db=db,
                _=admin,
            )

    audit.record(
        db,
        action="action",
        entity="attendance_regularisation",
        entity_id=row.id,
        label=f"{row.employee.employee_code if row.employee else row.employee_id}"
        f" · {row.attendance_date}",
        summary=f"Regularisation {payload.status}",
        commit=False,
    )
    notify(
        db,
        kind="regularisation",
        title=f"Your attendance correction was {payload.status}",
        body=f"{row.attendance_date}"
        + (f" · {payload.note}" if payload.note else ""),
        link="/employee?tab=attendance",
        entity="attendance_regularisation",
        entity_id=row.id,
        employee_id=row.employee_id,
    )
    db.commit()
    db.refresh(row)

    events.publish(
        f"employee:{row.employee_id}",
        "regularisation",
        regularisation_id=row.id,
        status=row.status,
        message=f"Your attendance correction was {row.status}",
    )
    events.publish("admin", "regularisation", regularisation_id=row.id)
    return regularisation_out(row)

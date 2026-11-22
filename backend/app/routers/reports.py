"""Reports: the same data the modules hold, summarised across a period.

Every report answers with rows and a totals line, and every one of them can
come out as CSV with the same filters applied, so what is on screen is what
lands in the file.
"""

import csv
import io
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Admin,
    AttendanceDay,
    Department,
    Employee,
    EmployeeLoan,
    LeaveBalance,
    LeaveRequest,
    LeaveType,
    PayrollRun,
    Payslip,
    SalaryAdvance,
)
from app.routers.auth import current_admin
from app.schemas import (
    AttendanceReport,
    AttendanceReportRow,
    HeadcountReport,
    HeadcountMonth,
    LeaveReport,
    LeaveReportRow,
    OutstandingReport,
    OutstandingRow,
    PayrollReport,
    PayrollReportRow,
    StatutoryReport,
    StatutoryRow,
)

router = APIRouter(prefix="/reports", tags=["reports"])

ZERO = Decimal("0")

# Statutory lines are recognised by the code the payroll engine writes.
PF_CODES = {"PF"}
ESI_CODES = {"ESI"}
PT_CODES = {"PT"}
TDS_CODES = {"TDS"}
PF_EMPLOYER = {"PF_ER"}
ESI_EMPLOYER = {"ESI_ER"}


def months_between(start: date, end: date) -> list[date]:
    """Every month start from `start` to `end`, inclusive."""
    out = []
    cursor = start.replace(day=1)
    last = end.replace(day=1)
    while cursor <= last:
        out.append(cursor)
        cursor = (
            cursor.replace(year=cursor.year + 1, month=1)
            if cursor.month == 12
            else cursor.replace(month=cursor.month + 1)
        )
    return out


def money(value) -> Decimal:
    return Decimal(str(value or 0))


def sum_codes(lines: list, codes: set[str]) -> Decimal:
    total = ZERO
    for line in lines or []:
        if str(line.get("code", "")).upper() in codes:
            total += money(line.get("amount"))
    return total


def csv_response(filename: str, header: list[str], rows: list[list]) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def employees_in_scope(
    db: Session, department_id: int | None, q: str | None, on: date | None = None
) -> list[Employee]:
    stmt = select(Employee)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if on:
        stmt = stmt.where(
            Employee.date_of_joining <= on,
            or_(Employee.date_of_exit.is_(None), Employee.date_of_exit >= on),
        )
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )
    return list(db.scalars(stmt.order_by(Employee.employee_code)).unique())


# ---------------------------------------------------------------------------
# Attendance
# ---------------------------------------------------------------------------


def attendance_rows(
    db: Session,
    date_from: date,
    date_to: date,
    department_id: int | None,
    q: str | None,
) -> list[AttendanceReportRow]:
    people = {e.id: e for e in employees_in_scope(db, department_id, q)}
    if not people:
        return []

    rows = db.scalars(
        select(AttendanceDay).where(
            AttendanceDay.attendance_date >= date_from,
            AttendanceDay.attendance_date <= date_to,
            AttendanceDay.employee_id.in_(list(people)),
        )
    ).unique()

    buckets: dict[int, AttendanceReportRow] = {}
    for row in rows:
        employee = people[row.employee_id]
        bucket = buckets.get(row.employee_id)
        if bucket is None:
            bucket = AttendanceReportRow(
                employee_id=employee.id,
                employee_code=employee.employee_code,
                employee_name=employee.full_name,
                department=(
                    employee.department_ref.name if employee.department_ref else None
                ),
            )
            buckets[row.employee_id] = bucket

        if row.status == "present":
            bucket.present += 1
        elif row.status == "half_day":
            bucket.half_day += 1
        elif row.status == "absent":
            bucket.absent += 1
        elif row.status == "on_leave":
            bucket.on_leave += 1
        elif row.status == "weekly_off":
            bucket.weekly_off += 1
        elif row.status == "holiday":
            bucket.holiday += 1
        else:
            bucket.not_marked += 1

        bucket.worked_minutes += row.worked_minutes or 0
        bucket.overtime_minutes += row.overtime_minutes or 0
        bucket.late_minutes += row.late_minutes or 0
        if row.late_minutes:
            bucket.late_days += 1
        if row.is_continued:
            bucket.continued_days += 1

    for bucket in buckets.values():
        bucket.payable_days = Decimal(bucket.present) + Decimal("0.5") * Decimal(
            bucket.half_day
        )

    return sorted(buckets.values(), key=lambda b: b.employee_code or "")


@router.get("/attendance", response_model=AttendanceReport)
def attendance_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
    q: str | None = None,
):
    rows = attendance_rows(db, date_from, date_to, department_id, q)
    return AttendanceReport(
        date_from=date_from,
        date_to=date_to,
        rows=rows,
        employees=len(rows),
        present=sum(r.present for r in rows),
        absent=sum(r.absent for r in rows),
        on_leave=sum(r.on_leave for r in rows),
        worked_minutes=sum(r.worked_minutes for r in rows),
        overtime_minutes=sum(r.overtime_minutes for r in rows),
    )


@router.get("/attendance.csv")
def attendance_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
    q: str | None = None,
):
    rows = attendance_rows(db, date_from, date_to, department_id, q)
    return csv_response(
        f"attendance-{date_from}-to-{date_to}.csv",
        [
            "Code", "Employee", "Department", "Present", "Half day", "Absent",
            "On leave", "Weekly off", "Holiday", "Not marked", "Payable days",
            "Worked (h)", "Overtime (h)", "Late days", "Continued days",
        ],
        [
            [
                r.employee_code, r.employee_name, r.department or "",
                r.present, r.half_day, r.absent, r.on_leave, r.weekly_off,
                r.holiday, r.not_marked, r.payable_days,
                round(r.worked_minutes / 60, 2), round(r.overtime_minutes / 60, 2),
                r.late_days, r.continued_days,
            ]
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# Payroll
# ---------------------------------------------------------------------------


def payroll_rows(
    db: Session, date_from: date, date_to: date, department_id: int | None
) -> list[PayrollReportRow]:
    runs = {
        run.id: run
        for run in db.scalars(
            select(PayrollRun).where(
                PayrollRun.period >= date_from.replace(day=1),
                PayrollRun.period <= date_to.replace(day=1),
            )
        )
    }
    if not runs:
        return []

    stmt = select(Payslip).where(Payslip.run_id.in_(list(runs)))
    slips = list(db.scalars(stmt).unique())

    by_month: dict[date, PayrollReportRow] = {}
    for slip in slips:
        employee = slip.employee
        if department_id and (
            employee is None or employee.department_id != department_id
        ):
            continue

        period = runs[slip.run_id].period
        row = by_month.get(period)
        if row is None:
            row = PayrollReportRow(period=period, status=runs[slip.run_id].status)
            by_month[period] = row

        row.employees += 1
        row.gross += money(slip.gross_pay)
        row.deductions += money(slip.total_deductions)
        row.net += money(slip.net_pay)
        row.lop_days += money(slip.lop_days)
        row.overtime_minutes += slip.overtime_minutes or 0
        row.pf += sum_codes(slip.deductions, PF_CODES)
        row.esi += sum_codes(slip.deductions, ESI_CODES)
        row.pt += sum_codes(slip.deductions, PT_CODES)
        row.tds += sum_codes(slip.deductions, TDS_CODES)
        row.employer_pf += sum_codes(slip.employer_contributions, PF_EMPLOYER)
        row.employer_esi += sum_codes(slip.employer_contributions, ESI_EMPLOYER)

    return [by_month[period] for period in sorted(by_month)]


@router.get("/payroll", response_model=PayrollReport)
def payroll_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
):
    rows = payroll_rows(db, date_from, date_to, department_id)
    return PayrollReport(
        date_from=date_from,
        date_to=date_to,
        rows=rows,
        gross=sum((r.gross for r in rows), ZERO),
        deductions=sum((r.deductions for r in rows), ZERO),
        net=sum((r.net for r in rows), ZERO),
        employer_cost=sum(
            (r.gross + r.employer_pf + r.employer_esi for r in rows), ZERO
        ),
    )


@router.get("/payroll.csv")
def payroll_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
):
    rows = payroll_rows(db, date_from, date_to, department_id)
    return csv_response(
        f"payroll-{date_from:%Y-%m}-to-{date_to:%Y-%m}.csv",
        [
            "Month", "Status", "Employees", "Gross", "Deductions", "Net",
            "PF (employee)", "PF (employer)", "ESI (employee)", "ESI (employer)",
            "PT", "TDS", "LOP days", "Overtime (h)",
        ],
        [
            [
                f"{r.period:%Y-%m}", r.status, r.employees, r.gross, r.deductions,
                r.net, r.pf, r.employer_pf, r.esi, r.employer_esi, r.pt, r.tds,
                r.lop_days, round(r.overtime_minutes / 60, 2),
            ]
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# Statutory — the same money, per employee, for the filings
# ---------------------------------------------------------------------------


def statutory_rows(
    db: Session, period: date, department_id: int | None
) -> list[StatutoryRow]:
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == period.replace(day=1)))
    if not run:
        return []

    out = []
    for slip in db.scalars(select(Payslip).where(Payslip.run_id == run.id)).unique():
        employee = slip.employee
        if department_id and (
            employee is None or employee.department_id != department_id
        ):
            continue

        out.append(
            StatutoryRow(
                employee_id=slip.employee_id,
                employee_code=employee.employee_code if employee else None,
                employee_name=employee.full_name if employee else None,
                uan=employee.uan if employee else None,
                esic_number=employee.esic_number if employee else None,
                pan=employee.pan if employee else None,
                gross=money(slip.gross_pay),
                pf_employee=sum_codes(slip.deductions, PF_CODES),
                pf_employer=sum_codes(slip.employer_contributions, PF_EMPLOYER),
                esi_employee=sum_codes(slip.deductions, ESI_CODES),
                esi_employer=sum_codes(slip.employer_contributions, ESI_EMPLOYER),
                pt=sum_codes(slip.deductions, PT_CODES),
                tds=sum_codes(slip.deductions, TDS_CODES),
            )
        )

    return sorted(out, key=lambda r: r.employee_code or "")


@router.get("/statutory", response_model=StatutoryReport)
def statutory_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    period: date = Query(..., description="Any date in the month"),
    department_id: int | None = None,
):
    rows = statutory_rows(db, period, department_id)
    return StatutoryReport(
        period=period.replace(day=1),
        rows=rows,
        pf_total=sum((r.pf_employee + r.pf_employer for r in rows), ZERO),
        esi_total=sum((r.esi_employee + r.esi_employer for r in rows), ZERO),
        pt_total=sum((r.pt for r in rows), ZERO),
        tds_total=sum((r.tds for r in rows), ZERO),
    )


@router.get("/statutory.csv")
def statutory_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    period: date = Query(...),
    department_id: int | None = None,
):
    rows = statutory_rows(db, period, department_id)
    return csv_response(
        f"statutory-{period:%Y-%m}.csv",
        [
            "Code", "Employee", "UAN", "ESIC", "PAN", "Gross",
            "PF employee", "PF employer", "ESI employee", "ESI employer",
            "PT", "TDS",
        ],
        [
            [
                r.employee_code, r.employee_name, r.uan or "", r.esic_number or "",
                r.pan or "", r.gross, r.pf_employee, r.pf_employer,
                r.esi_employee, r.esi_employer, r.pt, r.tds,
            ]
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# Leave
# ---------------------------------------------------------------------------


def leave_rows(
    db: Session, year: int, department_id: int | None, q: str | None
) -> list[LeaveReportRow]:
    first = date(year, 1, 1)
    last = date(year, 12, 31)
    people = {e.id: e for e in employees_in_scope(db, department_id, q)}
    if not people:
        return []

    types = {t.id: t for t in db.scalars(select(LeaveType))}

    taken: dict[tuple[int, int], Decimal] = defaultdict(lambda: ZERO)
    pending: dict[int, Decimal] = defaultdict(lambda: ZERO)
    for request in db.scalars(
        select(LeaveRequest).where(
            LeaveRequest.employee_id.in_(list(people)),
            LeaveRequest.start_date <= last,
            LeaveRequest.end_date >= first,
        )
    ).unique():
        if request.status == "approved":
            taken[(request.employee_id, request.leave_type_id)] += money(request.days)
        elif request.status == "pending":
            pending[request.employee_id] += money(request.days)

    balances: dict[tuple[int, int], Decimal] = {}
    for balance in db.scalars(
        select(LeaveBalance).where(LeaveBalance.employee_id.in_(list(people)))
    ):
        key = (balance.employee_id, balance.leave_type_id)
        balances[key] = money(getattr(balance, "closing", None) or 0)

    out = []
    for employee in people.values():
        for type_id, leave_type in types.items():
            used = taken.get((employee.id, type_id), ZERO)
            balance = balances.get((employee.id, type_id), ZERO)
            if used == ZERO and balance == ZERO:
                continue
            out.append(
                LeaveReportRow(
                    employee_id=employee.id,
                    employee_code=employee.employee_code,
                    employee_name=employee.full_name,
                    department=(
                        employee.department_ref.name
                        if employee.department_ref
                        else None
                    ),
                    leave_type=leave_type.name,
                    taken=used,
                    balance=balance,
                    pending=pending.get(employee.id, ZERO),
                )
            )

    return out


@router.get("/leave", response_model=LeaveReport)
def leave_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    year: int = Query(...),
    department_id: int | None = None,
    q: str | None = None,
):
    rows = leave_rows(db, year, department_id, q)
    return LeaveReport(
        year=year,
        rows=rows,
        taken=sum((r.taken for r in rows), ZERO),
        balance=sum((r.balance for r in rows), ZERO),
    )


@router.get("/leave.csv")
def leave_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    year: int = Query(...),
    department_id: int | None = None,
    q: str | None = None,
):
    rows = leave_rows(db, year, department_id, q)
    return csv_response(
        f"leave-{year}.csv",
        ["Code", "Employee", "Department", "Leave type", "Taken", "Balance", "Pending"],
        [
            [
                r.employee_code, r.employee_name, r.department or "", r.leave_type,
                r.taken, r.balance, r.pending,
            ]
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# Headcount and movement
# ---------------------------------------------------------------------------


@router.get("/headcount", response_model=HeadcountReport)
def headcount_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
):
    months = months_between(date_from, date_to)
    if not months:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "The end must follow the start"
        )

    stmt = select(Employee)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    employees = list(db.scalars(stmt).unique())

    rows = []
    for month in months:
        nxt = (
            month.replace(year=month.year + 1, month=1)
            if month.month == 12
            else month.replace(month=month.month + 1)
        )
        month_end = nxt - timedelta(days=1)

        joined = [e for e in employees if month <= e.date_of_joining <= month_end]
        left = [
            e
            for e in employees
            if e.date_of_exit and month <= e.date_of_exit <= month_end
        ]
        closing = [
            e
            for e in employees
            if e.date_of_joining <= month_end
            and (e.date_of_exit is None or e.date_of_exit > month_end)
        ]
        opening = len(closing) - len(joined) + len(left)

        rows.append(
            HeadcountMonth(
                period=month,
                opening=max(opening, 0),
                joined=len(joined),
                left=len(left),
                closing=len(closing),
                # Leavers against the average strength, the usual reading.
                attrition_percent=float(
                    round(
                        Decimal(len(left) * 100)
                        / Decimal(max((opening + len(closing)) / 2, 1)),
                        2,
                    )
                ),
            )
        )

    by_department: dict[str, int] = defaultdict(int)
    for employee in employees:
        if employee.status != "active":
            continue
        name = (
            employee.department_ref.name
            if employee.department_ref
            else "Unassigned"
        )
        by_department[name] += 1

    return HeadcountReport(
        date_from=date_from,
        date_to=date_to,
        months=rows,
        departments=dict(sorted(by_department.items(), key=lambda kv: -kv[1])),
        joined=sum(r.joined for r in rows),
        left=sum(r.left for r in rows),
        closing=rows[-1].closing if rows else 0,
    )


@router.get("/headcount.csv")
def headcount_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date = Query(...),
    date_to: date = Query(...),
    department_id: int | None = None,
):
    report = headcount_report(
        db=db, _=_, date_from=date_from, date_to=date_to, department_id=department_id
    )
    return csv_response(
        f"headcount-{date_from:%Y-%m}-to-{date_to:%Y-%m}.csv",
        ["Month", "Opening", "Joined", "Left", "Closing", "Attrition %"],
        [
            [f"{r.period:%Y-%m}", r.opening, r.joined, r.left, r.closing,
             r.attrition_percent]
            for r in report.months
        ],
    )


# ---------------------------------------------------------------------------
# Money owed back: loans and advances
# ---------------------------------------------------------------------------


@router.get("/outstanding", response_model=OutstandingReport)
def outstanding_report(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    department_id: int | None = None,
):
    rows: list[OutstandingRow] = []

    for loan in db.scalars(
        select(EmployeeLoan).where(EmployeeLoan.status == "active")
    ).unique():
        employee = loan.employee
        if department_id and (
            employee is None or employee.department_id != department_id
        ):
            continue

        # What is still owed is what the schedule has not collected yet.
        schedule = loan.schedule or []
        outstanding = sum(
            (money(i.amount) for i in schedule if i.status != "paid"), ZERO
        )
        recovered = sum(
            (money(i.amount) for i in schedule if i.status == "paid"), ZERO
        )

        rows.append(
            OutstandingRow(
                kind="loan",
                employee_id=loan.employee_id,
                employee_code=employee.employee_code if employee else None,
                employee_name=employee.full_name if employee else None,
                reference=loan.reference,
                principal=money(loan.principal),
                outstanding=outstanding,
                recovered=recovered,
                started=loan.start_period,
                note=loan.purpose,
            )
        )

    # An advance is netted off the same month's payslip, so anything not yet
    # recovered is still owed.
    for advance in db.scalars(
        select(SalaryAdvance).where(SalaryAdvance.status.in_(("pending", "paid")))
    ).unique():
        employee = advance.employee
        if department_id and (
            employee is None or employee.department_id != department_id
        ):
            continue
        rows.append(
            OutstandingRow(
                kind="advance",
                employee_id=advance.employee_id,
                employee_code=employee.employee_code if employee else None,
                employee_name=employee.full_name if employee else None,
                reference=f"{advance.period:%Y-%m}",
                principal=money(advance.amount),
                outstanding=money(advance.amount),
                recovered=ZERO,
                started=advance.period,
                note=advance.note,
            )
        )

    rows.sort(key=lambda r: (r.employee_code or "", r.kind))
    return OutstandingReport(
        rows=rows,
        loans=sum((r.outstanding for r in rows if r.kind == "loan"), ZERO),
        advances=sum((r.outstanding for r in rows if r.kind == "advance"), ZERO),
    )


@router.get("/outstanding.csv")
def outstanding_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    department_id: int | None = None,
):
    report = outstanding_report(db=db, _=_, department_id=department_id)
    return csv_response(
        "outstanding.csv",
        ["Kind", "Code", "Employee", "Reference", "Principal", "Recovered",
         "Outstanding", "Since", "Note"],
        [
            [r.kind, r.employee_code, r.employee_name, r.reference, r.principal,
             r.recovered, r.outstanding, r.started, r.note or ""]
            for r in report.rows
        ],
    )

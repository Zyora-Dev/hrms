import csv
import io
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import bonus as bonus_engine
from app import letters as letters_engine
from app import tds as tds_helper
from app.routers import tax_router
from app import payroll as engine
from app import payslip_templates as templates
from app import events, mailer
from app.db import get_db
from app.models import (
    Admin,
    AttendanceDay,
    Company,
    EmployeeLoan,
    LoanInstalment,
    SalaryAdvance,
    PayslipLayout,
    Employee,
    LeaveBalance,
    LeaveType,
    PayrollInput,
    PayrollRun,
    PayrollSettings,
    Payslip,
    SalaryComponent,
)
from app.routers.auth import current_admin
from app.uploads import IMAGE_TYPES, MAX_IMAGE_BYTES, save_upload
from app.schemas import (
    LeaveLine,
    LeaveTypeCreate,
    LeaveTypeOut,
    PayrollRunCreate,
    PayrollRunDetail,
    PayrollRunOut,
    BonusApply,
    BonusPreview,
    BonusRow,
    PayrollInputCreate,
    PayrollInputOut,
    PayrollRunStatusUpdate,
    PayrollSettingsOut,
    PayrollSettingsUpdate,
    PayslipLayoutCreate,
    PayslipLayoutOut,
    PayslipOptionsOut,
    PayslipOut,
    PayslipPreviewOut,
    PayslipPreviewRequest,
    SalaryComponentCreate,
    SalaryComponentOut,
)

router = APIRouter(prefix="/payroll", tags=["payroll"])

ZERO = Decimal("0")

# Inline styles — xhtml2pdf applies very little of a stylesheet to cells.
TH_L = "padding:4pt 5pt;border:0.4pt solid #d8dde5;background:#eef2fb;text-align:left"
TH_R = "padding:4pt 5pt;border:0.4pt solid #d8dde5;background:#eef2fb;text-align:right"
TD_L = "padding:3pt 5pt;border:0.4pt solid #e2e6ee;text-align:left"
TD_R = "padding:3pt 5pt;border:0.4pt solid #e2e6ee;text-align:right"


def get_settings(db: Session) -> PayrollSettings:
    row = db.scalar(select(PayrollSettings).order_by(PayrollSettings.id).limit(1))
    if row is None:
        row = PayrollSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def month_start(value: date) -> date:
    return value.replace(day=1)


def month_end(value: date) -> date:
    start = month_start(value)
    if start.month == 12:
        return start.replace(day=31)
    return start.replace(month=start.month + 1, day=1) - timedelta(days=1)


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------


@router.get("/settings", response_model=PayrollSettingsOut)
def read_settings(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    return get_settings(db)


@router.put("/settings", response_model=PayrollSettingsOut)
def update_settings(
    payload: PayrollSettingsUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = get_settings(db)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


# --------------------------------------------------------------------------
# Salary components
# --------------------------------------------------------------------------


@router.get("/components", response_model=list[SalaryComponentOut])
def list_components(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    include_inactive: bool = Query(default=True),
):
    stmt = select(SalaryComponent)
    if not include_inactive:
        stmt = stmt.where(SalaryComponent.is_active.is_(True))
    return list(
        db.scalars(stmt.order_by(SalaryComponent.kind, SalaryComponent.sort_order))
    )


@router.post(
    "/components", response_model=SalaryComponentOut, status_code=status.HTTP_201_CREATED
)
def create_component(
    payload: SalaryComponentCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(SalaryComponent).where(SalaryComponent.code == payload.code)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Component “{payload.code}” already exists"
        )
    row = SalaryComponent(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/components/{component_id}", response_model=SalaryComponentOut)
def update_component(
    component_id: int,
    payload: SalaryComponentCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(SalaryComponent, component_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component not found")

    clash = db.scalar(
        select(SalaryComponent).where(
            SalaryComponent.code == payload.code, SalaryComponent.id != component_id
        )
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Component “{payload.code}” already exists"
        )

    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_component(
    component_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(SalaryComponent, component_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Component not found")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------
# Leave types
# --------------------------------------------------------------------------


@router.get("/leave-types", response_model=list[LeaveTypeOut])
def list_leave_types(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    include_inactive: bool = Query(default=True),
):
    stmt = select(LeaveType)
    if not include_inactive:
        stmt = stmt.where(LeaveType.is_active.is_(True))
    return list(db.scalars(stmt.order_by(LeaveType.code)))


@router.post(
    "/leave-types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED
)
def create_leave_type(
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(LeaveType).where(LeaveType.code == payload.code)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Leave type “{payload.code}” already exists"
        )
    row = LeaveType(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/leave-types/{leave_type_id}", response_model=LeaveTypeOut)
def update_leave_type(
    leave_type_id: int,
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(LeaveType, leave_type_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave type not found")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/leave-types/{leave_type_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_leave_type(
    leave_type_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(LeaveType, leave_type_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave type not found")

    used = db.scalar(
        select(func.count())
        .select_from(LeaveBalance)
        .where(LeaveBalance.leave_type_id == leave_type_id)
    )
    if used:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This leave type already has balances. Deactivate it instead.",
        )
    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------
# Runs
# --------------------------------------------------------------------------


def attendance_for(
    db: Session, employee_id: int, start: date, end: date
) -> engine.AttendanceInput:
    rows = list(
        db.scalars(
            select(AttendanceDay).where(
                AttendanceDay.employee_id == employee_id,
                AttendanceDay.attendance_date >= start,
                AttendanceDay.attendance_date <= end,
            )
        ).unique()
    )

    data = engine.AttendanceInput()
    for row in rows:
        if row.status == "present":
            data.present_days += 1
        elif row.status == "half_day":
            data.half_days += 1
        elif row.status == "weekly_off":
            data.weekly_offs += 1
        elif row.status in ("on_leave", "holiday"):
            data.paid_leave_days += 1
        else:
            data.absent_days += 1

        data.worked_minutes += row.worked_minutes or 0
        data.overtime_minutes += row.overtime_minutes or 0
        if row.shift is not None:
            data.shift_minutes_expected += row.shift.paid_minutes

    return data


def leave_balances_for(
    db: Session, employee_id: int, period: date
) -> dict[int, dict]:
    """Opening balance comes from the previous period's closing."""
    previous = (
        period.replace(year=period.year - 1, month=12)
        if period.month == 1
        else period.replace(month=period.month - 1)
    )

    out: dict[int, dict] = {}
    for row in db.scalars(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id,
            LeaveBalance.period.in_([previous, period]),
        )
    ).unique():
        entry = out.setdefault(row.leave_type_id, {"opening": ZERO, "used": ZERO})
        if row.period == previous:
            entry["opening"] = row.closing
        else:
            entry["used"] = row.used
    return out


def persist_leave(
    db: Session, employee_id: int, period: date, outcomes: list
) -> None:
    for outcome in outcomes:
        row = db.scalar(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == outcome.leave_type_id,
                LeaveBalance.period == period,
            )
        )
        if row is None:
            row = LeaveBalance(
                employee_id=employee_id,
                leave_type_id=outcome.leave_type_id,
                period=period,
            )
            db.add(row)

        row.opening = outcome.opening
        row.accrued = outcome.accrued
        row.used = outcome.used
        row.encashed = outcome.encashed
        row.lapsed = outcome.lapsed
        row.closing = outcome.closing


def payslip_to_out(slip: Payslip, db: Session | None = None) -> PayslipOut:
    out = PayslipOut.model_validate(slip)
    if slip.employee:
        out.employee_name = slip.employee.full_name
        out.employee_code = slip.employee.employee_code
        out.designation = slip.employee.designation

    # Leave movement lives in leave_balance; surface it on the payslip so the
    # encashment line can be traced back to the days it came from.
    if db is not None and slip.run is not None:
        rows = db.scalars(
            select(LeaveBalance).where(
                LeaveBalance.employee_id == slip.employee_id,
                LeaveBalance.period == slip.run.period,
            )
        ).unique()
        out.leave = [
            LeaveLine(
                code=r.leave_type.code if r.leave_type else "",
                name=r.leave_type.name if r.leave_type else "",
                opening=r.opening,
                accrued=r.accrued,
                used=r.used,
                encashed=r.encashed,
                lapsed=r.lapsed,
                closing=r.closing,
                encashment_amount=ZERO,
            )
            for r in rows
        ]
    return out


@router.get("/runs", response_model=list[PayrollRunOut])
def list_runs(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    run_status: str | None = Query(default=None, alias="status"),
):
    stmt = select(PayrollRun)
    if date_from:
        stmt = stmt.where(PayrollRun.period >= month_start(date_from))
    if date_to:
        stmt = stmt.where(PayrollRun.period <= month_start(date_to))
    if run_status:
        stmt = stmt.where(PayrollRun.status == run_status)
    return list(db.scalars(stmt.order_by(PayrollRun.period.desc())))


@router.post("/runs", response_model=PayrollRunDetail, status_code=status.HTTP_201_CREATED)
def create_run(
    payload: PayrollRunCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    period = month_start(payload.period)
    if db.scalar(select(PayrollRun).where(PayrollRun.period == period)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"A run already exists for {period:%B %Y}. Recompute it instead.",
        )

    run = PayrollRun(period=period, notes=payload.notes)
    db.add(run)
    db.commit()
    db.refresh(run)
    return compute_run(run.id, db=db)


@router.post("/runs/{run_id}/compute", response_model=PayrollRunDetail)
def compute_run(
    run_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")
    if run.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only a draft run can be recomputed. Move it back to draft first.",
        )

    settings_row = get_settings(db)
    components = list(db.scalars(select(SalaryComponent)))
    if settings_row.tds_enabled:
        # The engine supplies TDS; a component of the same name would double it.
        components = [
            c for c in components if c.code.upper() != tax_router.TDS_CODE
        ]
    leave_types = list(db.scalars(select(LeaveType)))

    start, end = month_start(run.period), month_end(run.period)

    employees = list(
        db.scalars(
            select(Employee).where(
                Employee.date_of_joining <= end,
                (Employee.date_of_exit.is_(None)) | (Employee.date_of_exit >= start),
            )
        ).unique()
    )

    for old in db.scalars(select(Payslip).where(Payslip.run_id == run.id)).unique():
        db.delete(old)
    db.flush()

    # Instalments previously recovered by *this* run are released first, so a
    # recompute does not double-count them.
    for released in db.scalars(
        select(LoanInstalment).where(LoanInstalment.paid_in_run_id == run.id)
    ).unique():
        released.status = "pending"
        released.paid_in_run_id = None
    db.flush()

    for released_advance in db.scalars(
        select(SalaryAdvance).where(SalaryAdvance.recovered_in_run_id == run.id)
    ).unique():
        released_advance.status = "paid" if released_advance.paid_on else "pending"
        released_advance.recovered_in_run_id = None
    db.flush()

    # A salary advance is part of this month's own pay, so it is netted off
    # in full here — there is nothing to carry forward.
    advances = list(
        db.scalars(
            select(SalaryAdvance).where(
                SalaryAdvance.period == run.period,
                SalaryAdvance.status.in_(("pending", "paid")),
            )
        ).unique()
    )

    due_instalments = list(
        db.scalars(
            select(LoanInstalment)
            .join(EmployeeLoan)
            .where(
                LoanInstalment.due_period == run.period,
                LoanInstalment.status == "pending",
                EmployeeLoan.status == "active",
            )
        ).unique()
    )

    # Income tax, computed per employee from the projected annual position.
    tds_by_employee: dict[int, Decimal] = {}
    if settings_row.tds_enabled:
        year = tds_helper.financial_year(run.period)
        for employee in employees:
            try:
                result = tax_router.compute_for(
                    db, employee, year, upto_period=run.period
                )
            except HTTPException:
                # No regime configured for that year — skip rather than fail
                # the whole run.
                continue
            if result.monthly_tds > ZERO:
                tds_by_employee[employee.id] = result.monthly_tds

    # One-off inputs for this period, grouped per employee.
    extras_by_employee: dict[int, list[engine.ExtraLine]] = {}

    for employee_id, amount in tds_by_employee.items():
        extras_by_employee.setdefault(employee_id, []).append(
            engine.ExtraLine(kind="deduction", label="Income Tax (TDS)", amount=amount)
        )

    for advance in advances:
        taken = (
            f" ({advance.percent}% of salary)" if advance.percent is not None else ""
        )
        extras_by_employee.setdefault(advance.employee_id, []).append(
            engine.ExtraLine(
                kind="salary_advance",
                label=f"Salary advance{taken}",
                amount=Decimal(advance.amount),
            )
        )

    for instalment in due_instalments:
        loan = instalment.loan
        label = (
            f"{'Advance' if loan.kind == 'advance' else 'Loan'} "
            f"{loan.reference} · {instalment.seq}/{len(loan.schedule)}"
        )
        extras_by_employee.setdefault(loan.employee_id, []).append(
            engine.ExtraLine(
                kind="loan_emi", label=label, amount=Decimal(instalment.amount)
            )
        )
    for row in db.scalars(
        select(PayrollInput).where(PayrollInput.period == run.period)
    ).unique():
        extras_by_employee.setdefault(row.employee_id, []).append(
            engine.ExtraLine(
                kind=row.kind,
                label=row.label,
                amount=row.amount,
                hours=row.hours,
                include_in_pf=row.include_in_pf,
                include_in_esi=row.include_in_esi,
            )
        )

    totals = {"gross": ZERO, "ded": ZERO, "net": ZERO}

    for employee in employees:
        monthly_gross = (
            Decimal(employee.ctc_annual) / Decimal(12)
            if employee.ctc_annual
            else ZERO
        )

        result = engine.compute_payslip(
            period=run.period,
            monthly_gross=monthly_gross,
            attendance=attendance_for(db, employee.id, start, end),
            components=components,
            leave_types=leave_types,
            leave_balances=leave_balances_for(db, employee.id, run.period),
            settings=settings_row,
            extras=extras_by_employee.get(employee.id, []),
        )

        persist_leave(db, employee.id, run.period, result.leave)

        db.add(
            Payslip(
                run_id=run.id,
                employee_id=employee.id,
                monthly_gross=result.monthly_gross,
                period_days=result.period_days,
                payable_days=result.payable_days,
                lop_days=result.lop_days,
                worked_minutes=result.worked_minutes,
                overtime_minutes=result.overtime_minutes,
                earnings=[line.as_dict() for line in result.earnings],
                deductions=[line.as_dict() for line in result.deductions],
                employer_contributions=[
                    line.as_dict() for line in result.employer_contributions
                ],
                gross_pay=result.gross_pay,
                total_deductions=result.total_deductions,
                net_pay=result.net_pay,
            )
        )

        totals["gross"] += result.gross_pay
        totals["ded"] += result.total_deductions
        totals["net"] += result.net_pay

    # Mark what this run actually recovered.
    paid_ids = {e.id for e in employees}
    for advance in advances:
        if advance.employee_id in paid_ids:
            advance.status = "recovered"
            advance.recovered_in_run_id = run.id

    for instalment in due_instalments:
        if instalment.loan.employee_id in paid_ids:
            instalment.status = "paid"
            instalment.paid_in_run_id = run.id

    # Close a loan once nothing is left outstanding.
    for advance in advances:
        taken = (
            f" ({advance.percent}% of salary)" if advance.percent is not None else ""
        )
        extras_by_employee.setdefault(advance.employee_id, []).append(
            engine.ExtraLine(
                kind="salary_advance",
                label=f"Salary advance{taken}",
                amount=Decimal(advance.amount),
            )
        )

    for instalment in due_instalments:
        loan = instalment.loan
        if loan.status == "active" and not any(
            i.status == "pending" for i in loan.schedule
        ):
            loan.status = "closed"
            loan.closed_at = datetime.now(timezone.utc)

    run.total_gross = totals["gross"]
    run.total_deductions = totals["ded"]
    run.total_net = totals["net"]
    run.employee_count = len(employees)
    run.computed_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(run)
    return read_run(run.id, db=db)


@router.get("/runs/{run_id}", response_model=PayrollRunDetail)
def read_run(
    run_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")

    detail = PayrollRunDetail.model_validate(run)
    slips = db.scalars(
        select(Payslip).where(Payslip.run_id == run.id).order_by(Payslip.employee_id)
    ).unique()
    detail.payslips = [payslip_to_out(s, db) for s in slips]
    return detail


def filtered_payslips(
    db: Session,
    run_id: int,
    q: str | None = None,
    department_id: int | None = None,
    designation_id: int | None = None,
    only_lop: bool = False,
    only_overtime: bool = False,
    min_net: Decimal | None = None,
    max_net: Decimal | None = None,
) -> list[Payslip]:
    stmt = select(Payslip).where(Payslip.run_id == run_id).join(Employee)

    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            (func.lower(Employee.first_name).like(term))
            | (func.lower(Employee.last_name).like(term))
            | (func.lower(Employee.employee_code).like(term))
        )
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if designation_id:
        stmt = stmt.where(Employee.designation_id == designation_id)
    if only_lop:
        stmt = stmt.where(Payslip.lop_days > 0)
    if only_overtime:
        stmt = stmt.where(Payslip.overtime_minutes > 0)
    if min_net is not None:
        stmt = stmt.where(Payslip.net_pay >= min_net)
    if max_net is not None:
        stmt = stmt.where(Payslip.net_pay <= max_net)

    return list(db.scalars(stmt.order_by(Employee.employee_code)).unique())


@router.get("/runs/{run_id}/payslips", response_model=list[PayslipOut])
def list_payslips(
    run_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    q: str | None = None,
    department_id: int | None = None,
    designation_id: int | None = None,
    only_lop: bool = False,
    only_overtime: bool = False,
    min_net: Decimal | None = None,
    max_net: Decimal | None = None,
):
    if not db.get(PayrollRun, run_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")

    rows = filtered_payslips(
        db, run_id, q, department_id, designation_id, only_lop,
        only_overtime, min_net, max_net,
    )
    return [payslip_to_out(s, db) for s in rows]


@router.put("/runs/{run_id}/status", response_model=PayrollRunOut)
def set_run_status(
    run_id: int,
    payload: PayrollRunStatusUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")

    was = run.status
    run.status = payload.status
    db.commit()
    db.refresh(run)

    # Approving is the moment a payslip becomes something an employee may
    # see, so that is when it goes out.
    if payload.status == "approved" and was != "approved":
        email_payslips(db, run)

    return run


def email_payslips(db: Session, run: PayrollRun) -> int:
    """Queue each employee their own payslip for an approved run."""
    config = mailer.config(db)
    if not config.send_payslips:
        return 0

    queued = 0
    for slip in db.scalars(
        select(Payslip).where(Payslip.run_id == run.id)
    ).unique():
        employee = slip.employee
        if employee is None or not employee.work_email:
            continue

        mailer.queue(
            db,
            kind="payslip",
            to_email=employee.work_email,
            to_name=employee.full_name,
            subject=f"Payslip for {run.period:%B %Y}",
            lines=[
                f"Hello {employee.full_name or ''},".strip(),
                f"Your payslip for <b>{run.period:%B %Y}</b> is ready.",
                f"Net pay: <b>{slip.net_pay}</b>",
                "Download it from the portal — it is under Pay.",
            ],
            action=("Open the portal", "/employee?tab=pay"),
            entity="payslip",
            entity_id=slip.id,
        )
        queued += 1

    db.commit()
    events.publish("admin", "payroll", message=f"{queued} payslip email(s) queued")
    return queued


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(
    run_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")
    if run.status == "paid":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "A paid run cannot be deleted"
        )
    db.delete(run)
    db.commit()


@router.get("/runs/{run_id}/payslips/{employee_id}", response_model=PayslipOut)
def read_payslip(
    run_id: int,
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    slip = db.scalar(
        select(Payslip).where(
            Payslip.run_id == run_id, Payslip.employee_id == employee_id
        )
    )
    if not slip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")
    return payslip_to_out(slip, db)


# --------------------------------------------------------------------------
# Reports and payslip documents
# --------------------------------------------------------------------------


def clear_default(db: Session, exclude: int | None = None) -> None:
    stmt = select(PayslipLayout).where(PayslipLayout.is_default.is_(True))
    if exclude is not None:
        stmt = stmt.where(PayslipLayout.id != exclude)
    for row in db.scalars(stmt):
        row.is_default = False


def leave_lines_for(db: Session, slip: Payslip) -> list[dict]:
    rows = db.scalars(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == slip.employee_id,
            LeaveBalance.period == slip.run.period,
        )
    ).unique()
    return [
        {
            "code": r.leave_type.code if r.leave_type else "",
            "name": r.leave_type.name if r.leave_type else "",
            "opening": str(r.opening),
            "accrued": str(r.accrued),
            "used": str(r.used),
            "encashed": str(r.encashed),
            "lapsed": str(r.lapsed),
            "closing": str(r.closing),
        }
        for r in rows
    ]


def resolve_layout(
    db: Session, layout_id: int | None, base_override: str | None
) -> tuple[str, dict]:
    """A saved layout wins; otherwise fall back to a bare base."""
    layout = None
    if layout_id is not None:
        layout = db.get(PayslipLayout, layout_id)
        if layout is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout not found")
    elif base_override is None:
        layout = db.scalar(
            select(PayslipLayout).where(PayslipLayout.is_default.is_(True)).limit(1)
        )

    if layout is not None:
        return layout.base, layout.options or {}

    base = base_override or get_settings(db).payslip_template
    if base not in templates.BASES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"Unknown template “{base}”"
        )
    return base, {}


def report_rows(slips: list[Payslip]) -> tuple[list[str], list[list[str]]]:
    """Flatten payslips into a table, with a column per component code."""
    earning_codes: list[str] = []
    deduction_codes: list[str] = []

    for slip in slips:
        for line in slip.earnings or []:
            if line["code"] not in earning_codes:
                earning_codes.append(line["code"])
        for line in slip.deductions or []:
            if line["code"] not in deduction_codes:
                deduction_codes.append(line["code"])

    header = [
        "Employee code", "Employee", "Designation", "Department",
        "Payable days", "Period days", "LOP days", "Worked hours", "OT hours",
        *earning_codes, "Gross", *deduction_codes, "Total deductions", "Net pay",
    ]

    rows: list[list[str]] = []
    for slip in slips:
        employee = slip.employee
        earn = {line["code"]: line["amount"] for line in (slip.earnings or [])}
        ded = {line["code"]: line["amount"] for line in (slip.deductions or [])}

        rows.append(
            [
                employee.employee_code if employee else "",
                employee.full_name if employee else "",
                (employee.designation or "") if employee else "",
                (employee.department or "") if employee else "",
                str(slip.payable_days),
                str(slip.period_days),
                str(slip.lop_days),
                f"{slip.worked_minutes / 60:.2f}",
                f"{slip.overtime_minutes / 60:.2f}",
                *[str(earn.get(code, "0")) for code in earning_codes],
                str(slip.gross_pay),
                *[str(ded.get(code, "0")) for code in deduction_codes],
                str(slip.total_deductions),
                str(slip.net_pay),
            ]
        )

    return header, rows


@router.get("/runs/{run_id}/report.csv")
def report_csv(
    run_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    q: str | None = None,
    department_id: int | None = None,
    only_lop: bool = False,
    only_overtime: bool = False,
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")

    slips = filtered_payslips(
        db, run_id, q, department_id, None, only_lop, only_overtime
    )
    header, rows = report_rows(slips)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)

    filename = f"payroll-{run.period:%Y-%m}.csv"
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/runs/{run_id}/report.pdf")
def report_pdf(
    run_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    q: str | None = None,
    department_id: int | None = None,
    only_lop: bool = False,
    only_overtime: bool = False,
):
    run = db.get(PayrollRun, run_id)
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payroll run not found")

    slips = filtered_payslips(
        db, run_id, q, department_id, None, only_lop, only_overtime
    )
    company = db.scalar(select(Company).order_by(Company.id).limit(1))
    name, meta = templates.company_block(company)

    head = (
        "<tr>"
        + "".join(
            f"<th style='{th}'>{h}</th>"
            for h, th in [
                ("Code", TH_L), ("Employee", TH_L), ("Department", TH_L),
                ("Days", TH_R), ("LOP", TH_R), ("OT hrs", TH_R),
                ("Gross", TH_R), ("Deductions", TH_R), ("Net pay", TH_R),
            ]
        )
        + "</tr>"
    )

    body = ""
    totals = {"gross": ZERO, "ded": ZERO, "net": ZERO}
    for slip in slips:
        employee = slip.employee
        totals["gross"] += slip.gross_pay
        totals["ded"] += slip.total_deductions
        totals["net"] += slip.net_pay
        body += (
            "<tr>"
            f"<td style='{TD_L}'>{templates.esc(employee.employee_code if employee else '')}</td>"
            f"<td style='{TD_L}'>{templates.esc(employee.full_name if employee else '')}</td>"
            f"<td style='{TD_L}'>{templates.esc((employee.department or '—') if employee else '—')}</td>"
            f"<td style='{TD_R}'>{slip.payable_days}/{slip.period_days}</td>"
            f"<td style='{TD_R}'>{slip.lop_days}</td>"
            f"<td style='{TD_R}'>{slip.overtime_minutes / 60:.1f}</td>"
            f"<td style='{TD_R}'>{templates.rupees(slip.gross_pay)}</td>"
            f"<td style='{TD_R}'>{templates.rupees(slip.total_deductions)}</td>"
            f"<td style='{TD_R}'><b>{templates.rupees(slip.net_pay)}</b></td>"
            "</tr>"
        )

    document = f"""<html><head><meta charset="utf-8"><style>
@page {{ size: A4 landscape; margin: 1.3cm; }}
body {{ font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #14181f; }}
table {{ width: 100%; border-collapse: collapse; }}
.head {{ border-bottom: 1.5pt solid #072869; padding-bottom: 6pt; margin-bottom: 10pt; }}
.footer {{ position: fixed; bottom: 0.6cm; left: 0; right: 0;
           text-align: center; font-size: 7pt; color: #9aa3af; }}
</style></head><body>
<div class="head">
  <div style="font-size:13pt;font-weight:bold;color:#072869">{name}</div>
  <div style="font-size:7.5pt;color:#6b7280">{meta}</div>
</div>

<table style="margin-bottom:8pt"><tr>
  <td><b style="font-size:11pt">Payroll register — {templates.period_label(run.period)}</b>
      <div style="font-size:8pt;color:#6b7280">{len(slips)} employee(s) · status: {run.status}</div></td>
  <td style="text-align:right;font-size:8pt;color:#6b7280">
      Generated {templates.period_label(run.period)}</td>
</tr></table>

<table>{head}{body}
<tr>
  <td style='{TD_L}' colspan="6"><b>Total</b></td>
  <td style='{TD_R}'><b>{templates.rupees(totals["gross"])}</b></td>
  <td style='{TD_R}'><b>{templates.rupees(totals["ded"])}</b></td>
  <td style='{TD_R}'><b>{templates.rupees(totals["net"])}</b></td>
</tr>
</table>
<div class="footer">{name} — payroll register, computer generated</div>
</body></html>"""

    pdf = letters_engine.to_pdf(document)
    filename = f"payroll-{run.period:%Y-%m}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/payslip-bases")
def payslip_bases(_: Admin = Depends(current_admin)):
    return [{"value": k, "label": v} for k, v in templates.BASES.items()]


@router.get("/payslip-options", response_model=PayslipOptionsOut)
def payslip_option_defaults(_: Admin = Depends(current_admin)):
    return templates.DEFAULT_OPTIONS


@router.get("/payslip-layouts", response_model=list[PayslipLayoutOut])
def list_layouts(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    return list(
        db.scalars(
            select(PayslipLayout).order_by(
                PayslipLayout.is_default.desc(), PayslipLayout.name
            )
        )
    )


@router.post(
    "/payslip-layouts", response_model=PayslipLayoutOut, status_code=status.HTTP_201_CREATED
)
def create_layout(
    payload: PayslipLayoutCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = PayslipLayout(**payload.model_dump())
    if row.is_default:
        clear_default(db)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/payslip-layouts/{layout_id}", response_model=PayslipLayoutOut)
def update_layout(
    layout_id: int,
    payload: PayslipLayoutCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(PayslipLayout, layout_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout not found")

    if payload.is_default:
        clear_default(db, exclude=layout_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return row


@router.delete("/payslip-layouts/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layout(
    layout_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(PayslipLayout, layout_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout not found")
    db.delete(row)
    db.commit()


@router.post("/payslip-layouts/logo")
def upload_payslip_logo(
    file: UploadFile = File(...),
    _: Admin = Depends(current_admin),
):
    """A logo for a payslip design, independent of the company profile."""
    path = save_upload(
        file,
        folder="payslip/logos",
        prefix="logo",
        allowed=IMAGE_TYPES,
        max_bytes=MAX_IMAGE_BYTES,
    )
    return {"logo_path": path}


@router.post("/payslip-layouts/preview", response_model=PayslipPreviewOut)
def preview_layout(
    payload: PayslipPreviewRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Render a design without saving it, so the editor can show it live."""
    company = db.scalar(select(Company).order_by(Company.id).limit(1))

    slip = None
    if payload.run_id and payload.employee_id:
        slip = db.scalar(
            select(Payslip).where(
                Payslip.run_id == payload.run_id,
                Payslip.employee_id == payload.employee_id,
            )
        )
    elif payload.run_id:
        slip = db.scalar(
            select(Payslip).where(Payslip.run_id == payload.run_id).limit(1)
        )

    if slip is not None:
        data = templates.slip_data(slip)
        data["leave"] = leave_lines_for(db, slip)
        period = slip.run.period
        sample = False
    else:
        data = templates.SAMPLE
        period = date.today().replace(day=1)
        sample = True

    # Browser preview: images must be URLs the browser can fetch.
    html_doc = templates.render(
        payload.base,
        data,
        company,
        period,
        payload.options,
        asset_base=str(request.base_url),
    )
    return PayslipPreviewOut(html=html_doc, sample=sample)


@router.get("/runs/{run_id}/payslips/{employee_id}/pdf")
def payslip_pdf(
    run_id: int,
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    template: str | None = None,
    layout_id: int | None = None,
):
    slip = db.scalar(
        select(Payslip).where(
            Payslip.run_id == run_id, Payslip.employee_id == employee_id
        )
    )
    if not slip:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not found")

    base, options = resolve_layout(db, layout_id, template)

    company = db.scalar(select(Company).order_by(Company.id).limit(1))
    data = templates.slip_data(slip)
    data["leave"] = leave_lines_for(db, slip)

    document = templates.render(base, data, company, slip.run.period, options)
    pdf = letters_engine.to_pdf(document, link_callback=templates.link_callback)

    code = slip.employee.employee_code if slip.employee else employee_id
    filename = f"payslip-{code}-{slip.run.period:%Y-%m}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


# --------------------------------------------------------------------------
# One-off payroll inputs: bonus, incentive, deduction, extra overtime
# --------------------------------------------------------------------------


def lop_reversal_amount(
    db: Session, employee_id: int, reference_period: date, days: Decimal
) -> Decimal:
    """Price a reversal at the rate of the month being corrected.

    Using the current month's rate would be wrong whenever salary changed in
    between, and would leave nothing tying the credit to the original period.
    """
    reference = month_start(reference_period)
    slip = db.scalar(
        select(Payslip)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(Payslip.employee_id == employee_id, PayrollRun.period == reference)
    )
    if slip is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"No payslip for {reference:%B %Y} to reverse LOP from",
        )

    if Decimal(slip.lop_days) <= ZERO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{reference:%B %Y} had no loss of pay to reverse",
        )
    if Decimal(days) > Decimal(slip.lop_days):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"{reference:%B %Y} had only {slip.lop_days} LOP day(s)",
        )

    period_days = Decimal(slip.period_days or 0)
    if period_days <= ZERO:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "That period has no day basis"
        )

    per_day = Decimal(slip.monthly_gross) / period_days
    return engine.money(per_day * Decimal(days))


def input_to_out(row: PayrollInput) -> PayrollInputOut:
    out = PayrollInputOut.model_validate(row)
    if row.employee:
        out.employee_name = row.employee.full_name
        out.employee_code = row.employee.employee_code
    return out


@router.get("/inputs", response_model=list[PayrollInputOut])
def list_inputs(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    period: date | None = None,
    employee_id: int | None = None,
    kind: str | None = None,
):
    stmt = select(PayrollInput)
    if period:
        stmt = stmt.where(PayrollInput.period == month_start(period))
    if employee_id:
        stmt = stmt.where(PayrollInput.employee_id == employee_id)
    if kind:
        stmt = stmt.where(PayrollInput.kind == kind)

    rows = db.scalars(
        stmt.order_by(PayrollInput.period.desc(), PayrollInput.id.desc())
    ).unique()
    return [input_to_out(r) for r in rows]


@router.post("/inputs", response_model=PayrollInputOut, status_code=status.HTTP_201_CREATED)
def create_input(
    payload: PayrollInputCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if not db.get(Employee, payload.employee_id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Employee not found")

    period = month_start(payload.period)
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == period))
    if run and run.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{period:%B %Y} is already {run.status}. Reopen it to change inputs.",
        )

    data = payload.model_dump()
    data["period"] = period

    if payload.kind == "lop_reversal":
        data["amount"] = lop_reversal_amount(
            db, payload.employee_id, payload.reference_period, payload.days
        )

    row = PayrollInput(**data)
    db.add(row)
    db.commit()
    db.refresh(row)
    return input_to_out(row)


@router.delete("/inputs/{input_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_input(
    input_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(PayrollInput, input_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Input not found")

    run = db.scalar(select(PayrollRun).where(PayrollRun.period == row.period))
    if run and run.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT, "That period is locked. Reopen it first."
        )

    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------
# Statutory bonus
# --------------------------------------------------------------------------


@router.get("/statutory-bonus", response_model=BonusPreview)
def preview_statutory_bonus(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    rate: Decimal | None = Query(default=None, ge=0, le=100),
):
    """Accrue the bonus across an accounting year, per employee."""
    settings_row = get_settings(db)
    fy = financial_year if financial_year is not None else tds_helper.financial_year(
        date.today()
    )
    start, end = tds_helper.fy_bounds(fy)

    rows = db.execute(
        select(Payslip, Employee)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .join(Employee, Payslip.employee_id == Employee.id)
        .where(PayrollRun.period >= start, PayrollRun.period <= end)
        .order_by(Employee.employee_code)
    ).all()

    grouped: dict[int, dict] = {}
    for slip, employee in rows:
        entry = grouped.setdefault(employee.id, {"employee": employee, "slips": []})
        entry["slips"].append(slip)

    results = [
        bonus_engine.compute(e["slips"], e["employee"], settings_row, rate)
        for e in grouped.values()
    ]

    return BonusPreview(
        financial_year=tds_helper.fy_label(fy),
        rate=results[0].rate if results else Decimal(settings_row.bonus_rate_percent),
        basis=settings_row.bonus_basis,
        eligibility_ceiling=settings_row.bonus_eligibility_ceiling,
        calculation_ceiling=max(
            Decimal(settings_row.bonus_calculation_ceiling),
            Decimal(settings_row.bonus_minimum_wage or 0),
        ),
        total=sum((r.amount for r in results), ZERO),
        eligible_count=sum(1 for r in results if r.eligible and r.amount > ZERO),
        rows=[BonusRow(**vars(r)) for r in results],
    )


@router.post("/statutory-bonus/apply", response_model=list[PayrollInputOut])
def apply_statutory_bonus(
    payload: BonusApply,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Push the computed bonus into a month as payroll inputs."""
    period = month_start(payload.period)
    run = db.scalar(select(PayrollRun).where(PayrollRun.period == period))
    if run and run.status != "draft":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{period:%B %Y} is already {run.status}. Reopen it first.",
        )

    preview = preview_statutory_bonus(
        db=db, financial_year=payload.financial_year, rate=payload.rate
    )

    created: list[PayrollInput] = []
    for row in preview.rows:
        if not row.eligible or row.amount <= ZERO:
            continue

        existing = db.scalar(
            select(PayrollInput).where(
                PayrollInput.employee_id == row.employee_id,
                PayrollInput.period == period,
                PayrollInput.kind == "bonus",
                PayrollInput.label == payload.label,
            )
        )
        if existing:
            existing.amount = row.amount
            created.append(existing)
            continue

        entry = PayrollInput(
            employee_id=row.employee_id,
            period=period,
            kind="bonus",
            label=payload.label,
            amount=row.amount,
            include_in_pf=False,
            include_in_esi=True,
            note=f"FY {preview.financial_year} @ {row.rate}%",
        )
        db.add(entry)
        created.append(entry)

    db.commit()
    for entry in created:
        db.refresh(entry)
    return [input_to_out(e) for e in created]

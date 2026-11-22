"""Employee self-service: signing in as yourself rather than as an admin.

Kept apart from the admin side on purpose. Different table, different token
type, different session rows — an employee token presented to an admin
endpoint fails on its type before anything is looked up.
"""

from datetime import date, datetime, timezone
from decimal import Decimal

import jwt
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit
from app.notifications import notify
from app import secrets_store, throttle
from app import events
from app.db import get_db
from app.models import (
    AttendanceDay,
    AttendanceRegularisation,
    Employee,
    EmployeeDocument,
    EmployeeSession,
    Company,
    Holiday,
    LeaveRequest,
    LeaveType,
    Notification,
    PayrollRun,
    Payslip,
    ReimbursementClaim,
    TdsChallan,
)
from app import forms
from app import letters as letters_engine
from app import tds as fy_helper
from app.routers import leave_router as leave_helper
from app.routers import tax_router
from app.routers import payroll_router as payroll_helper
from app.routers.attendance_router import month_bounds
from app.schemas import (
    ClaimCreate,
    ClaimOut,
    EmployeeLogin,
    EmployeeMeOut,
    EmployeePasswordChange,
    LeaveBalanceOut,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveTypeOut,
    MyAttendanceDay,
    MyAttendanceMonth,
    MyDocument,
    MyLeaveRequest,
    MyHoliday,
    MyNotification,
    MyFormYear,
    MyPayslip,
    MyProfile,
    RegularisationCreate,
    RegularisationOut,
    SessionOut,
    TokenOut,
)
from app.services import attendance_service as svc
from app.uploads import DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, save_upload
from app.security import (
    create_employee_token,
    decode_token,
    describe_device,
    hash_password,
    new_jti,
    password_problem,
    verify_password,
)

router = APIRouter(prefix="/employee", tags=["employee portal"])
bearer = HTTPBearer(auto_error=True)


@router.post("/login", response_model=TokenOut)
def login(payload: EmployeeLogin, request: Request, db: Session = Depends(get_db)):
    """Sign in with an employee ID and password."""
    code = payload.employee_code.strip()
    address = request.client.host if request and request.client else None

    verdict = throttle.check_address(address)
    if not verdict.allowed:
        audit.set_admin(None, code)
        audit.record(
            db,
            action="login_failed",
            entity="employee",
            label=code,
            summary=f"Blocked: {verdict.reason}",
        )
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            verdict.reason,
            headers={"Retry-After": str(verdict.retry_after)},
        )

    employee = db.scalar(
        select(Employee).where(func.lower(Employee.employee_code) == code.lower())
    )

    # One message for every failure: whether an ID exists is not public.
    refused = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Invalid employee ID or password"
    )

    if (
        employee is None
        or not employee.portal_enabled
        or not employee.password_hash
        or not verify_password(payload.password, employee.password_hash)
    ):
        throttle.record_failure(code, address)

        spent = throttle.check_account(code)
        if not spent.allowed:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                spent.reason,
                headers={"Retry-After": str(spent.retry_after)},
            )

        audit.set_admin(None, code)
        audit.record(
            db,
            action="login_failed",
            entity="employee",
            entity_id=employee.id if employee else None,
            label=code,
            summary=(
                "No such employee ID"
                if employee is None
                else "Portal access is off"
                if not employee.portal_enabled or not employee.password_hash
                else "Wrong password"
            ),
        )
        raise refused

    if employee.status not in ("active", "probation", "notice_period"):
        audit.record(
            db,
            action="login_failed",
            entity="employee",
            entity_id=employee.id,
            label=code,
            summary=f"Employee is {employee.status}",
        )
        raise refused

    throttle.record_success(code, address)

    jti = new_jti()
    token, expires_at = create_employee_token(str(employee.id), jti)
    user_agent = request.headers.get("user-agent")

    # Attribute the sign-in to the employee rather than leaving it as system.
    audit.set_admin(None, f"{employee.employee_code} (employee)")

    db.add(
        EmployeeSession(
            employee_id=employee.id,
            jti=jti,
            ip_address=request.client.host if request.client else None,
            user_agent=(user_agent or "")[:255] or None,
            device=describe_device(user_agent),
            expires_at=expires_at,
        )
    )
    employee.last_login_at = datetime.now(timezone.utc)

    audit.record(
        db,
        action="login",
        entity="employee",
        entity_id=employee.id,
        label=f"{employee.employee_code} · {employee.full_name}",
        summary=f"Employee signed in from {describe_device(user_agent)}",
        commit=False,
    )
    db.commit()
    return TokenOut(access_token=token, expires_at=expires_at)


def current_employee(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Employee:
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired") from None
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from None

    if payload.get("type") != "employee":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    employee = db.get(Employee, int(payload["sub"]))
    if employee is None or not employee.portal_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    jti = payload.get("jti")
    if jti:
        session = db.scalar(
            select(EmployeeSession).where(EmployeeSession.jti == jti)
        )
        if session is None or session.revoked_at is not None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "This device was signed out"
            )
        session.last_seen_at = datetime.now(timezone.utc)
        db.commit()

    audit.set_admin(None, f"{employee.employee_code} (employee)")
    return employee


@router.get("/me", response_model=EmployeeMeOut)
def me(employee: Employee = Depends(current_employee)):
    return EmployeeMeOut(
        id=employee.id,
        employee_code=employee.employee_code,
        full_name=employee.full_name,
        work_email=employee.work_email,
        designation=(
            employee.designation_ref.name if employee.designation_ref else None
        ),
        department=(
            employee.department_ref.name if employee.department_ref else None
        ),
        date_of_joining=employee.date_of_joining,
        photo_path=employee.photo_path,
        must_change_password=employee.must_change_password,
    )


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: EmployeePasswordChange,
    request: Request,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Change your own password. Other devices are signed out."""
    if not employee.password_hash or not verify_password(
        payload.current_password, employee.password_hash
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That is not your current password"
        )

    problem = password_problem(payload.new_password)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)

    employee.password_hash = hash_password(payload.new_password)
    employee.password_changed_at = datetime.now(timezone.utc)
    employee.must_change_password = False

    keep = None
    try:
        keep = decode_token(
            request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        ).get("jti")
    except jwt.PyJWTError:
        pass

    for session in db.scalars(
        select(EmployeeSession).where(
            EmployeeSession.employee_id == employee.id,
            EmployeeSession.revoked_at.is_(None),
        )
    ):
        if keep and session.jti == keep:
            continue
        session.revoked_at = datetime.now(timezone.utc)
        session.revoked_reason = "password changed"

    audit.record(
        db,
        action="action",
        entity="employee",
        entity_id=employee.id,
        label=employee.employee_code,
        summary="Employee changed their own password",
        commit=False,
    )
    db.commit()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    try:
        jti = decode_token(
            request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        ).get("jti")
    except jwt.PyJWTError:
        return

    session = db.scalar(
        select(EmployeeSession).where(
            EmployeeSession.jti == jti, EmployeeSession.employee_id == employee.id
        )
    )
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        session.revoked_reason = "signed out"
        db.commit()


# ---------------------------------------------------------------------------
# My attendance — read only
# ---------------------------------------------------------------------------


@router.get("/attendance", response_model=MyAttendanceMonth)
def my_attendance(
    month: str | None = None,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """One month of my own attendance. Nothing here can be edited."""
    today = datetime.now(svc.tz()).date()
    month = month or f"{today:%Y-%m}"
    first, last = month_bounds(month)

    rows = list(
        db.scalars(
            select(AttendanceDay)
            .where(
                AttendanceDay.employee_id == employee.id,
                AttendanceDay.attendance_date >= first,
                AttendanceDay.attendance_date <= last,
            )
            .order_by(AttendanceDay.attendance_date)
        ).unique()
    )

    out = MyAttendanceMonth(month=month)
    for row in rows:
        out.days.append(
            MyAttendanceDay(
                attendance_date=row.attendance_date,
                status=row.status,
                shift_name=row.shift.name if row.shift else None,
                first_in=row.first_in,
                last_out=row.last_out,
                worked_minutes=row.worked_minutes,
                overtime_minutes=row.overtime_minutes,
                late_minutes=row.late_minutes,
                is_continued=row.is_continued,
            )
        )

        if row.status == "present":
            out.present += 1
        elif row.status == "half_day":
            out.present += Decimal("0.5")
        elif row.status == "absent":
            out.absent += 1
        elif row.status == "on_leave":
            out.on_leave += 1
        elif row.status == "weekly_off":
            out.weekly_off += 1
        elif row.status == "holiday":
            out.holiday += 1

        out.worked_minutes += row.worked_minutes or 0
        out.overtime_minutes += row.overtime_minutes or 0
        if row.late_minutes:
            out.late_days += 1

    return out


# ---------------------------------------------------------------------------
# My leave
# ---------------------------------------------------------------------------


@router.get("/leave/balances", response_model=list[LeaveBalanceOut])
def my_leave_balances(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    return leave_helper.balances_for(db, employee, date.today())


@router.get("/leave/types", response_model=list[LeaveTypeOut])
def my_leave_types(
    db: Session = Depends(get_db),
    _: Employee = Depends(current_employee),
):
    return list(
        db.scalars(
            select(LeaveType)
            .where(LeaveType.is_active.is_(True))
            .order_by(LeaveType.name)
        )
    )


@router.get("/leave/requests", response_model=list[LeaveRequestOut])
def my_leave_requests(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    rows = db.scalars(
        select(LeaveRequest)
        .where(LeaveRequest.employee_id == employee.id)
        .order_by(LeaveRequest.start_date.desc())
        .limit(50)
    ).unique()
    return [leave_helper.to_out(r) for r in rows]


@router.post(
    "/leave/requests",
    response_model=LeaveRequestOut,
    status_code=status.HTTP_201_CREATED,
)
def apply_for_leave(
    payload: MyLeaveRequest,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Apply for leave on my own behalf.

    The employee id is taken from the session, never from the request body —
    otherwise anyone could book leave for somebody else.
    """
    created = leave_helper.create_request(
        LeaveRequestCreate(
            employee_id=employee.id,
            leave_type_id=payload.leave_type_id,
            start_date=payload.start_date,
            end_date=payload.end_date,
            is_half_day=payload.is_half_day,
            reason=payload.reason,
        ),
        db=db,
        _=None,
    )

    span = (
        f"{created.start_date:%d %b}"
        if created.start_date == created.end_date
        else f"{created.start_date:%d %b} – {created.end_date:%d %b}"
    )
    notify(
        db,
        kind="leave_request",
        title=f"{employee.full_name} applied for leave",
        body=f"{created.leave_type_name or 'Leave'} · {created.days} day(s) · {span}"
        + (f" · {payload.reason}" if payload.reason else ""),
        link=f"/admin/leave?request={created.id}",
        entity="leave_request",
        entity_id=created.id,
        actor=f"{employee.employee_code} · {employee.full_name}",
        commit=True,
    )
    events.publish(
        "admin",
        "leave_request",
        request_id=created.id,
        employee=employee.full_name,
        message=f"{employee.full_name} applied for leave",
    )
    return created


@router.delete("/leave/requests/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_leave(
    request_id: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    row = db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.id == request_id,
            LeaveRequest.employee_id == employee.id,
        )
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if row.status != "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"This request was already {row.status} — ask HR to change it",
        )

    row.status = "cancelled"
    row.decided_at = datetime.now(timezone.utc)
    audit.record(
        db,
        action="action",
        entity="leave_request",
        entity_id=row.id,
        label=employee.employee_code,
        summary="Employee withdrew their leave request",
        commit=False,
    )
    db.commit()
    events.publish(
        "admin",
        "leave_request",
        request_id=row.id,
        message=f"{employee.full_name} withdrew a leave request",
    )


# ---------------------------------------------------------------------------
# My pay
# ---------------------------------------------------------------------------


@router.get("/payslips", response_model=list[MyPayslip])
def my_payslips(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Only from pay runs that have been approved or paid.

    A draft run is still being worked on; showing it would have people asking
    about numbers that are about to change.
    """
    rows = db.scalars(
        select(Payslip)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(
            Payslip.employee_id == employee.id,
            PayrollRun.status.in_(("approved", "paid")),
        )
        .order_by(PayrollRun.period.desc())
    ).unique()

    return [
        MyPayslip(
            run_id=slip.run_id,
            period=slip.run.period,
            status=slip.run.status,
            gross_pay=slip.gross_pay,
            total_deductions=slip.total_deductions,
            net_pay=slip.net_pay,
            lop_days=slip.lop_days,
            payable_days=slip.payable_days,
            earnings=slip.earnings or [],
            deductions=slip.deductions or [],
        )
        for slip in rows
    ]


@router.get("/payslips/{run_id}/pdf")
def my_payslip_pdf(
    run_id: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    run = db.get(PayrollRun, run_id)
    if not run or run.status not in ("approved", "paid"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payslip not available")

    return payroll_helper.payslip_pdf(
        run_id=run_id, employee_id=employee.id, db=db, _=None
    )


# ---------------------------------------------------------------------------
# My documents
# ---------------------------------------------------------------------------


@router.get("/documents", response_model=list[MyDocument])
def my_documents(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    rows = db.scalars(
        select(EmployeeDocument)
        .where(EmployeeDocument.employee_id == employee.id)
        .order_by(EmployeeDocument.uploaded_at.desc())
    )
    return [
        MyDocument(
            id=doc.id,
            kind=doc.doc_type,
            title=doc.title or doc.original_name or doc.doc_type,
            file_path=doc.file_path,
            uploaded_at=doc.uploaded_at,
        )
        for doc in rows
    ]


# ---------------------------------------------------------------------------
# My reimbursement claims
# ---------------------------------------------------------------------------


def claim_out(claim: ReimbursementClaim) -> ClaimOut:
    out = ClaimOut.model_validate(claim)
    if claim.employee:
        out.employee_code = claim.employee.employee_code
        out.employee_name = claim.employee.full_name
    return out


def next_reference(db: Session) -> str:
    count = db.scalar(select(func.count(ReimbursementClaim.id))) or 0
    return f"RMB-{count + 1:05d}"


@router.get("/claims", response_model=list[ClaimOut])
def my_claims(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    rows = db.scalars(
        select(ReimbursementClaim)
        .where(ReimbursementClaim.employee_id == employee.id)
        .order_by(ReimbursementClaim.created_at.desc())
    ).unique()
    return [claim_out(c) for c in rows]


@router.post("/claims", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
def raise_claim(
    category: str = Form(...),
    title: str = Form(...),
    spent_on: date = Form(...),
    amount: Decimal = Form(...),
    description: str | None = Form(default=None),
    receipt: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Raise a claim, with the receipt attached if there is one."""
    try:
        payload = ClaimCreate(
            category=category,
            title=title,
            spent_on=spent_on,
            amount=amount,
            description=description,
        )
    except ValidationError as exc:
        # Built by hand from form fields, so the usual 422 has to be raised
        # here rather than by FastAPI's own body validation.
        first = exc.errors()[0]
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            str(first.get("msg", "Check the details")).replace(
                "Value error, ", ""
            ),
        ) from exc

    receipt_path = None
    if receipt is not None and receipt.filename:
        receipt_path = save_upload(
            receipt,
            folder="receipts",
            prefix=f"claim-{employee.employee_code}",
            allowed=DOCUMENT_TYPES,
            max_bytes=MAX_DOCUMENT_BYTES,
        )

    claim = ReimbursementClaim(
        reference=next_reference(db),
        employee_id=employee.id,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        spent_on=payload.spent_on,
        amount=payload.amount,
        receipt_path=receipt_path,
        status="pending",
    )
    db.add(claim)

    audit.record(
        db,
        action="create",
        entity="reimbursement_claim",
        label=f"{employee.employee_code} · {payload.title}",
        summary=f"Claim raised for {payload.amount}",
        commit=False,
    )
    db.flush()

    notify(
        db,
        kind="reimbursement_claim",
        title=f"{employee.full_name} claimed an expense",
        body=f"{claim.reference} · {payload.title} · {payload.amount}",
        link=f"/admin/payroll?tab=claims&claim={claim.id}",
        entity="reimbursement_claim",
        entity_id=claim.id,
        actor=f"{employee.employee_code} · {employee.full_name}",
    )
    db.commit()
    db.refresh(claim)

    events.publish(
        "admin",
        "reimbursement_claim",
        claim_id=claim.id,
        employee=employee.full_name,
        message=f"{employee.full_name} claimed {payload.amount}",
    )
    return claim_out(claim)


@router.delete("/claims/{claim_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_claim(
    claim_id: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    claim = db.scalar(
        select(ReimbursementClaim).where(
            ReimbursementClaim.id == claim_id,
            ReimbursementClaim.employee_id == employee.id,
        )
    )
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Claim not found")
    if claim.status != "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This claim was already {claim.status}"
        )

    claim.status = "cancelled"
    db.commit()


def mask_tail(value: str | None, keep: int = 4) -> str | None:
    """Show only the last few digits of an identifier."""
    if not value:
        return None
    tail = value.strip()[-keep:]
    return f"{'•' * max(len(value.strip()) - keep, 0)}{tail}"


@router.get("/profile", response_model=MyProfile)
def my_profile(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """The whole record as it stands, read-only."""
    shift = svc.shift_resolver(db, employee.id)(date.today())

    return MyProfile(
        id=employee.id,
        employee_code=employee.employee_code,
        full_name=employee.full_name,
        photo_path=employee.photo_path,
        status=employee.status,
        gender=employee.gender,
        date_of_birth=employee.date_of_birth,
        blood_group=employee.blood_group,
        marital_status=employee.marital_status,
        work_email=employee.work_email,
        personal_email=employee.personal_email,
        phone=employee.phone,
        alternate_phone=employee.alternate_phone,
        current_address=employee.current_address,
        permanent_address=employee.permanent_address,
        emergency_contact_name=employee.emergency_contact_name,
        emergency_contact_relation=employee.emergency_contact_relation,
        emergency_contact_phone=employee.emergency_contact_phone,
        designation=(
            employee.designation_ref.name if employee.designation_ref else None
        ),
        department=(
            employee.department_ref.name if employee.department_ref else None
        ),
        employment_type=employee.employment_type,
        work_location=employee.work_location,
        date_of_joining=employee.date_of_joining,
        probation_end_date=employee.probation_end_date,
        reporting_manager=(
            employee.reporting_manager.full_name
            if employee.reporting_manager
            else None
        ),
        shift_name=shift.name if shift else None,
        pan=employee.pan,
        aadhaar_masked=secrets_store.masked(employee.aadhaar_last4),
        uan=employee.uan,
        pf_number=employee.pf_number,
        esic_number=employee.esic_number,
        bank_name=employee.bank_name,
        bank_account_masked=mask_tail(employee.bank_account_number),
        bank_ifsc=employee.bank_ifsc,
        last_login_at=employee.last_login_at,
    )


# ---------------------------------------------------------------------------
# My devices
# ---------------------------------------------------------------------------


def current_jti(request: Request) -> str | None:
    try:
        return decode_token(
            request.headers.get("authorization", "").removeprefix("Bearer ").strip()
        ).get("jti")
    except jwt.PyJWTError:
        return None


@router.get("/sessions", response_model=list[SessionOut])
def my_sessions(
    request: Request,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    here = current_jti(request)
    rows = db.scalars(
        select(EmployeeSession)
        .where(
            EmployeeSession.employee_id == employee.id,
            EmployeeSession.revoked_at.is_(None),
        )
        .order_by(EmployeeSession.last_seen_at.desc())
    )
    return [
        SessionOut(
            id=row.id,
            device=row.device,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            revoked_reason=row.revoked_reason,
            is_current=here is not None and row.jti == here,
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_my_session(
    session_id: int,
    request: Request,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    row = db.scalar(
        select(EmployeeSession).where(
            EmployeeSession.id == session_id,
            EmployeeSession.employee_id == employee.id,
        )
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    if row.revoked_at is not None:
        return
    if row.jti == current_jti(request):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That is this device — use sign out instead",
        )

    row.revoked_at = datetime.now(timezone.utc)
    row.revoked_reason = "signed out by employee"
    db.commit()


@router.post("/sessions/revoke-others", response_model=list[SessionOut])
def revoke_my_other_sessions(
    request: Request,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    here = current_jti(request)
    for row in db.scalars(
        select(EmployeeSession).where(
            EmployeeSession.employee_id == employee.id,
            EmployeeSession.revoked_at.is_(None),
        )
    ):
        if here and row.jti == here:
            continue
        row.revoked_at = datetime.now(timezone.utc)
        row.revoked_reason = "signed out by employee"
    db.commit()
    return my_sessions(request=request, db=db, employee=employee)


# ---------------------------------------------------------------------------
# My notifications
# ---------------------------------------------------------------------------


@router.get("/notifications", response_model=list[MyNotification])
def my_notifications(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
    limit: int = 30,
):
    rows = db.scalars(
        select(Notification)
        .where(Notification.employee_id == employee.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    return [MyNotification.model_validate(r, from_attributes=True) for r in rows]


@router.get("/notifications/unread", response_model=dict)
def my_unread(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    return {
        "unread": db.scalar(
            select(func.count(Notification.id)).where(
                Notification.employee_id == employee.id,
                Notification.read_at.is_(None),
            )
        )
        or 0
    }


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all_mine(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    now = datetime.now(timezone.utc)
    for row in db.scalars(
        select(Notification).where(
            Notification.employee_id == employee.id,
            Notification.read_at.is_(None),
        )
    ):
        row.read_at = now
    db.commit()


# ---------------------------------------------------------------------------
# Holidays
# ---------------------------------------------------------------------------


@router.get("/holidays", response_model=list[MyHoliday])
def my_holidays(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
    year: int | None = None,
):
    today = datetime.now(svc.tz()).date()
    year = year or today.year

    rows = db.scalars(
        select(Holiday)
        .where(
            Holiday.holiday_date >= date(year, 1, 1),
            Holiday.holiday_date <= date(year, 12, 31),
        )
        .order_by(Holiday.holiday_date)
    )

    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                "Saturday", "Sunday"]
    location = (employee.work_location or "").strip().lower()

    return [
        MyHoliday(
            name=h.name,
            holiday_date=h.holiday_date,
            kind=h.kind,
            weekday=weekdays[h.holiday_date.weekday()],
            is_past=h.holiday_date < today,
        )
        for h in rows
        # A holiday with no location applies everywhere.
        if not h.location or h.location.strip().lower() == location
    ]


# ---------------------------------------------------------------------------
# Attendance regularisation
# ---------------------------------------------------------------------------


def regularisation_out(row: AttendanceRegularisation) -> RegularisationOut:
    out = RegularisationOut.model_validate(row)
    if row.employee:
        out.employee_code = row.employee.employee_code
        out.employee_name = row.employee.full_name
    return out


@router.get("/regularisations", response_model=list[RegularisationOut])
def my_regularisations(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    rows = db.scalars(
        select(AttendanceRegularisation)
        .where(AttendanceRegularisation.employee_id == employee.id)
        .order_by(AttendanceRegularisation.created_at.desc())
        .limit(50)
    ).unique()
    return [regularisation_out(r) for r in rows]


@router.post(
    "/regularisations",
    response_model=RegularisationOut,
    status_code=status.HTTP_201_CREATED,
)
def request_regularisation(
    payload: RegularisationCreate,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Ask for one day to be corrected."""
    existing = db.scalar(
        select(AttendanceRegularisation).where(
            AttendanceRegularisation.employee_id == employee.id,
            AttendanceRegularisation.attendance_date == payload.attendance_date,
            AttendanceRegularisation.status == "pending",
        )
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "You already have a request waiting on that day",
        )

    day = db.scalar(
        select(AttendanceDay).where(
            AttendanceDay.employee_id == employee.id,
            AttendanceDay.attendance_date == payload.attendance_date,
        )
    )

    row = AttendanceRegularisation(
        employee_id=employee.id,
        attendance_date=payload.attendance_date,
        current_status=day.status if day else None,
        requested_status=payload.requested_status,
        requested_in=payload.requested_in,
        requested_out=payload.requested_out,
        reason=payload.reason,
    )
    db.add(row)
    db.flush()

    notify(
        db,
        kind="regularisation",
        title=f"{employee.full_name} asked to correct attendance",
        body=f"{payload.attendance_date} · {payload.reason}",
        link=f"/admin/attendance?regularisation={row.id}",
        entity="attendance_regularisation",
        entity_id=row.id,
        actor=f"{employee.employee_code} · {employee.full_name}",
    )
    db.commit()
    db.refresh(row)

    events.publish(
        "admin",
        "regularisation",
        regularisation_id=row.id,
        message=f"{employee.full_name} asked to correct {payload.attendance_date}",
    )
    return regularisation_out(row)


@router.delete(
    "/regularisations/{request_id}", status_code=status.HTTP_204_NO_CONTENT
)
def withdraw_regularisation(
    request_id: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    row = db.scalar(
        select(AttendanceRegularisation).where(
            AttendanceRegularisation.id == request_id,
            AttendanceRegularisation.employee_id == employee.id,
        )
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if row.status != "pending":
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"This request was already {row.status}"
        )

    row.status = "cancelled"
    db.commit()
    events.publish("admin", "regularisation", regularisation_id=row.id)


# ---------------------------------------------------------------------------
# Form 130
# ---------------------------------------------------------------------------


def build_form130(db: Session, employee: Employee, year: int) -> forms.Form130:
    """Gather one employee's year from the payslips that were actually issued."""
    company = db.scalar(select(Company).order_by(Company.id).limit(1))
    form = forms.Form130(employee, company, year)

    first = date(year, 4, 1)
    last = date(year + 1, 3, 31)

    slips = db.scalars(
        select(Payslip)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(
            Payslip.employee_id == employee.id,
            PayrollRun.status.in_(("approved", "paid")),
            PayrollRun.period >= first,
            PayrollRun.period <= last,
        )
        .order_by(PayrollRun.period)
    ).unique()

    for slip in slips:
        tds = sum(
            (
                Decimal(str(line.get("amount", 0)))
                for line in (slip.deductions or [])
                if str(line.get("code", "")).upper() == "TDS"
            ),
            Decimal("0"),
        )
        form.add_payslip(slip.run.period, slip.gross_pay, tds)

    for challan in db.scalars(
        select(TdsChallan).where(
            TdsChallan.period >= first, TdsChallan.period <= last
        )
    ):
        form.add_challan(challan.period, challan)

    # The slab working is the one part a payslip never held.
    try:
        result = tax_router.compute_for(db, employee, year)
        form.computation = {
            "regime_name": result.regime_name,
            "taxable_income": result.taxable_income,
            "slab_tax": result.slab_tax,
            "rebate": result.rebate,
            "surcharge": result.surcharge,
            "cess": result.cess,
            "annual_tax": result.annual_tax,
        }
        form.exemptions = [(line.label, line.amount) for line in result.exemptions]
        form.deductions = [(line.label, line.amount) for line in result.deductions]
    except HTTPException:
        # No regime defined for that year: Part A still stands on its own.
        form.computation = {"regime_name": "regime on record"}

    return form


def form130_years(db: Session, employee: Employee) -> list[MyFormYear]:
    """Years this employee actually has an approved payslip in."""
    rows = db.execute(
        select(PayrollRun.period, Payslip.gross_pay, Payslip.deductions)
        .join(Payslip, Payslip.run_id == PayrollRun.id)
        .where(
            Payslip.employee_id == employee.id,
            PayrollRun.status.in_(("approved", "paid")),
        )
    ).all()

    years: dict[int, MyFormYear] = {}
    for period, gross, deductions in rows:
        year = fy_helper.financial_year(period)
        bucket = years.setdefault(
            year, MyFormYear(year=year, label=forms.fy_label(year))
        )
        bucket.gross += Decimal(str(gross or 0))
        bucket.months += 1
        bucket.tds += sum(
            (
                Decimal(str(line.get("amount", 0)))
                for line in (deductions or [])
                if str(line.get("code", "")).upper() == "TDS"
            ),
            Decimal("0"),
        )

    return [years[y] for y in sorted(years, reverse=True)]


@router.get("/forms/years", response_model=list[MyFormYear])
def my_form_years(
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    return form130_years(db, employee)


@router.get("/forms/form130")
def my_form130(
    year: int,
    db: Session = Depends(get_db),
    employee: Employee = Depends(current_employee),
):
    """Download my own Form 130 for a financial year."""
    form = build_form130(db, employee, year)
    if not form.months:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No approved payslip exists for {forms.fy_label(year)}",
        )

    pdf = letters_engine.to_pdf(forms.render(form))
    filename = f"form130-{employee.employee_code}-{forms.fy_label(year)}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

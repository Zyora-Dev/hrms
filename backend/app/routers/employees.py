import secrets
from datetime import date, datetime, timedelta, timezone
from math import ceil

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import (
    Admin,
    Department,
    Designation,
    Employee,
    EmployeeDocument,
    EmployeeSession,
)
from app import audit, employee_codes, mailer
from app.routers import settings_router as settings_helper
from app.routers.auth import current_admin
from app.schemas import (
    DocType,
    EmployeeCreate,
    EmployeeDocumentOut,
    EmployeeListItem,
    EmployeeOut,
    EmployeePage,
    EmployeeUpdate,
    PortalAccessOut,
    PortalAccessUpdate,
)
from app import secrets_store
from app.security import hash_password, password_problem
from app.uploads import (
    DOCUMENT_TYPES,
    IMAGE_TYPES,
    MAX_DOCUMENT_BYTES,
    MAX_IMAGE_BYTES,
    absolute_url,
    delete_upload,
    save_upload,
)

router = APIRouter(prefix="/employees", tags=["employees"])


def next_employee_code(db: Session, joined: date, department: str | None) -> str:
    """Built from the configurable pattern in employee settings."""
    settings_row = settings_helper.employee_settings(db)

    # A yearly reset restarts the sequence on the first hire of a new
    # financial year.
    if settings_row.code_reset == "yearly":
        year = employee_codes.financial_year(joined)
        if settings_row.code_reset_year != year:
            settings_row.code_reset_year = year
            settings_row.code_next_number = 1

    sequence = settings_row.code_next_number

    # Skip any code already taken, so a manual entry can't collide.
    for _ in range(1000):
        code = employee_codes.build(
            settings_row.code_pattern,
            sequence,
            settings_row.code_padding,
            joined,
            department,
        )
        if not db.scalar(select(Employee).where(Employee.employee_code == code)):
            settings_row.code_next_number = sequence + 1
            return code
        sequence += 1

    raise HTTPException(
        status.HTTP_409_CONFLICT,
        "Could not find a free employee code — check the pattern in settings.",
    )


def apply_aadhaar(employee: Employee, value: str | None) -> None:
    """Store it encrypted, keep the last four for the screens."""
    if value is None:
        return
    cleaned = value.strip()
    if not cleaned:
        employee.aadhaar_encrypted = None
        employee.aadhaar_last4 = None
        return
    employee.aadhaar_encrypted = secrets_store.encrypt(cleaned)
    employee.aadhaar_last4 = secrets_store.last4(cleaned)


def to_out(employee: Employee, request: Request) -> EmployeeOut:
    base = str(request.base_url)
    out = EmployeeOut.model_validate(employee)
    out.aadhaar = None
    out.aadhaar_masked = secrets_store.masked(employee.aadhaar_last4)
    out.photo_url = absolute_url(base, employee.photo_path)
    out.reporting_manager_name = (
        employee.reporting_manager.full_name if employee.reporting_manager else None
    )
    for doc, model in zip(out.documents, employee.documents):
        doc.file_url = absolute_url(base, model.file_path)
    return out


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return employee


def ensure_email_free(db: Session, email: str, exclude_id: int | None = None) -> None:
    stmt = select(Employee).where(func.lower(Employee.work_email) == email.lower())
    if exclude_id is not None:
        stmt = stmt.where(Employee.id != exclude_id)
    if db.scalar(stmt):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another employee already uses that work email"
        )


def validate_lookups(db: Session, payload) -> None:
    """Reject ids that don't exist, so a bad id fails loudly instead of
    silently storing NULL."""
    for field, model, label in (
        ("department_id", Department, "Department"),
        ("designation_id", Designation, "Designation"),
    ):
        value = getattr(payload, field)
        if value is not None and not db.get(model, value):
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label} not found"
            )


def validate_manager(db: Session, manager_id: int | None, employee_id: int | None) -> None:
    if manager_id is None:
        return
    if manager_id == employee_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "An employee cannot report to themselves",
        )
    if not db.get(Employee, manager_id):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Reporting manager not found"
        )


@router.get("", response_model=EmployeePage)
def list_employees(
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    q: str | None = Query(default=None, description="Name, code or email"),
    department_id: int | None = None,
    employee_status: str | None = Query(default=None, alias="status"),
    employment_type: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    stmt = select(Employee)

    if q:
        term = f"%{q.strip().lower()}%"
        # Subqueries rather than joins: the lookups are already eager-loaded,
        # and a second join would duplicate rows.
        stmt = stmt.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(
                    Employee.first_name + " " + Employee.last_name
                ).like(term),
                func.lower(Employee.work_email).like(term),
                func.lower(Employee.employee_code).like(term),
                Employee.department_id.in_(
                    select(Department.id).where(func.lower(Department.name).like(term))
                ),
                Employee.designation_id.in_(
                    select(Designation.id).where(
                        func.lower(Designation.name).like(term)
                    )
                ),
            )
        )
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if employee_status:
        stmt = stmt.where(Employee.status == employee_status)
    if employment_type:
        stmt = stmt.where(Employee.employment_type == employment_type)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    rows = db.scalars(
        stmt.order_by(Employee.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()

    items = []
    for emp in rows:
        item = EmployeeListItem.model_validate(emp)
        item.photo_url = absolute_url(str(request.base_url), emp.photo_path)
        items.append(item)

    return EmployeePage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    ensure_email_free(db, payload.work_email)
    validate_lookups(db, payload)
    validate_manager(db, payload.reporting_manager_id, None)

    settings_row = settings_helper.employee_settings(db)
    data = payload.model_dump()
    manual = data.pop("employee_code", None)
    aadhaar = data.pop("aadhaar", None)

    if manual:
        if not settings_row.allow_manual_code:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Codes are generated automatically; turn on manual entry in "
                "Settings to type one.",
            )
        manual = manual.strip().upper()
        if db.scalar(select(Employee).where(Employee.employee_code == manual)):
            raise HTTPException(
                status.HTTP_409_CONFLICT, f"Employee code “{manual}” is taken"
            )
        code = manual
    else:
        department = (
            db.get(Department, data["department_id"]).name
            if data.get("department_id")
            else None
        )
        code = next_employee_code(db, data["date_of_joining"], department)

    # Probation can default to a fixed period after joining.
    if not data.get("probation_end_date") and settings_row.default_probation_days:
        data["probation_end_date"] = data["date_of_joining"] + timedelta(
            days=settings_row.default_probation_days
        )

    employee = Employee(**data, employee_code=code)
    apply_aadhaar(employee, aadhaar)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return to_out(employee, request)


@router.get("/{employee_id}", response_model=EmployeeOut)
def read_employee(
    employee_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    return to_out(get_employee_or_404(db, employee_id), request)


@router.put("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)
    ensure_email_free(db, payload.work_email, exclude_id=employee_id)
    validate_lookups(db, payload)
    validate_manager(db, payload.reporting_manager_id, employee_id)

    data = payload.model_dump()
    aadhaar = data.pop("aadhaar", None)
    for field, value in data.items():
        setattr(employee, field, value)
    apply_aadhaar(employee, aadhaar)

    db.commit()
    db.refresh(employee)
    return to_out(employee, request)


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)

    delete_upload(employee.photo_path)
    for doc in employee.documents:
        delete_upload(doc.file_path)

    db.delete(employee)
    db.commit()


# --------------------------------------------------------------------------
# Photo
# --------------------------------------------------------------------------


@router.post("/{employee_id}/photo", response_model=EmployeeOut)
def upload_photo(
    employee_id: int,
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)
    old = employee.photo_path

    employee.photo_path = save_upload(
        file,
        folder="employees/photos",
        prefix=str(employee.id),
        allowed=IMAGE_TYPES,
        max_bytes=MAX_IMAGE_BYTES,
    )
    db.commit()
    db.refresh(employee)
    delete_upload(old)
    return to_out(employee, request)


@router.delete("/{employee_id}/photo", response_model=EmployeeOut)
def delete_photo(
    employee_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)
    if employee.photo_path:
        delete_upload(employee.photo_path)
        employee.photo_path = None
        db.commit()
        db.refresh(employee)
    return to_out(employee, request)


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------


@router.post(
    "/{employee_id}/documents",
    response_model=EmployeeDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def upload_document(
    employee_id: int,
    request: Request,
    doc_type: DocType = Form(...),
    title: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)

    path = save_upload(
        file,
        folder="employees/documents",
        prefix=f"{employee.id}-{doc_type}",
        allowed=DOCUMENT_TYPES,
        max_bytes=MAX_DOCUMENT_BYTES,
    )

    document = EmployeeDocument(
        employee_id=employee.id,
        doc_type=doc_type,
        title=(title or "").strip() or None,
        file_path=path,
        original_name=file.filename,
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    out = EmployeeDocumentOut.model_validate(document)
    out.file_url = absolute_url(str(request.base_url), document.file_path)
    return out


@router.delete(
    "/{employee_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_document(
    employee_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    document = db.get(EmployeeDocument, document_id)
    if not document or document.employee_id != employee_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")

    delete_upload(document.file_path)
    db.delete(document)
    db.commit()


@router.get("/{employee_id}/portal", response_model=PortalAccessOut)
def portal_access(
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    return PortalAccessOut(
        employee_id=employee.id,
        employee_code=employee.employee_code,
        portal_enabled=employee.portal_enabled,
        must_change_password=employee.must_change_password,
        last_login_at=employee.last_login_at,
        password_changed_at=employee.password_changed_at,
    )


@router.put("/{employee_id}/portal", response_model=PortalAccessOut)
def set_portal_access(
    employee_id: int,
    payload: PortalAccessUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Turn self-service on or off, and set or reset the password.

    Leaving the password out while switching access on generates one, which is
    returned here and nowhere else — it is stored only as a hash.
    """
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    generated = None

    if not payload.enabled:
        employee.portal_enabled = False
        for session in db.scalars(
            select(EmployeeSession).where(
                EmployeeSession.employee_id == employee.id,
                EmployeeSession.revoked_at.is_(None),
            )
        ):
            session.revoked_at = datetime.now(timezone.utc)
            session.revoked_reason = "access withdrawn"
        summary = "Self-service access switched off"
    else:
        password = payload.password
        if password is None and not employee.password_hash:
            generated = password = secrets.token_urlsafe(9)
        elif password is None:
            password = None  # keep the existing one

        if password is not None:
            problem = password_problem(password)
            if problem and not generated:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
            employee.password_hash = hash_password(password)
            employee.password_changed_at = datetime.now(timezone.utc)
            # Anything the admin knows has to be replaced by the employee.
            for session in db.scalars(
                select(EmployeeSession).where(
                    EmployeeSession.employee_id == employee.id,
                    EmployeeSession.revoked_at.is_(None),
                )
            ):
                session.revoked_at = datetime.now(timezone.utc)
                session.revoked_reason = "password reset"

        employee.portal_enabled = True
        employee.must_change_password = payload.must_change_password
        summary = (
            "Self-service password reset"
            if password is not None
            else "Self-service access switched on"
        )

    config = mailer.config(db)
    if payload.enabled and password and config.send_portal_invites:
        mailer.queue(
            db,
            kind="portal_invite",
            to_email=employee.work_email,
            to_name=employee.full_name,
            subject="Your HR portal sign-in",
            lines=[
                f"Hello {employee.full_name or ''},".strip(),
                "You can now see your attendance, leave, payslips and claims "
                "in the HR portal.",
                f"Employee ID: <b>{employee.employee_code}</b>",
                f"Password: <b>{password}</b>",
                "You will be asked to choose your own password the first "
                "time you sign in.",
            ],
            action=("Sign in", "/employee/login"),
            entity="employee",
            entity_id=employee.id,
        )

    audit.record(
        db,
        action="action",
        entity="employee",
        entity_id=employee.id,
        label=f"{employee.employee_code} · {employee.full_name}",
        summary=summary,
        commit=False,
    )
    db.commit()
    db.refresh(employee)

    return PortalAccessOut(
        employee_id=employee.id,
        employee_code=employee.employee_code,
        portal_enabled=employee.portal_enabled,
        must_change_password=employee.must_change_password,
        last_login_at=employee.last_login_at,
        password_changed_at=employee.password_changed_at,
        temporary_password=generated,
    )


@router.get("/{employee_id}/aadhaar", response_model=dict)
def reveal_aadhaar(
    employee_id: int,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """The number itself, for a filing that genuinely needs it.

    Every call is written to the audit trail with who asked, because the
    point of encrypting it is that nobody reads it casually.
    """
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    value = secrets_store.decrypt(employee.aadhaar_encrypted)
    if not value:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "No Aadhaar is on file for this employee"
        )

    audit.record(
        db,
        action="action",
        entity="employee",
        entity_id=employee.id,
        label=f"{employee.employee_code} · {employee.full_name}",
        summary="Aadhaar revealed",
    )
    return {"aadhaar": value}

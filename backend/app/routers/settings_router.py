from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app import employee_codes
from app.models import Admin, AttendanceSettings, Employee, EmployeeSettings
from app.routers.auth import current_admin
from app.schemas import (
    AttendanceSettingsOut,
    AttendanceSettingsUpdate,
    CodePreviewRequest,
    CodeTokenOut,
    EmployeeSettingsOut,
    EmployeeSettingsUpdate,
)

router = APIRouter(prefix="/settings", tags=["settings"])


def get_or_create(db: Session) -> AttendanceSettings:
    """Single row; created with defaults on first read."""
    row = db.scalar(select(AttendanceSettings).order_by(AttendanceSettings.id).limit(1))
    if row is None:
        row = AttendanceSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("/attendance", response_model=AttendanceSettingsOut)
def read_attendance_settings(
    db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    return get_or_create(db)


@router.put("/attendance", response_model=AttendanceSettingsOut)
def update_attendance_settings(
    payload: AttendanceSettingsUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = get_or_create(db)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row



# --------------------------------------------------------------------------
# Employee settings
# --------------------------------------------------------------------------


def employee_settings(db: Session) -> EmployeeSettings:
    row = db.scalar(select(EmployeeSettings).order_by(EmployeeSettings.id).limit(1))
    if row is None:
        row = EmployeeSettings(id=1)
        # Continue from the highest number already issued, so switching to a
        # configurable pattern never re-uses a code.
        latest = db.scalar(
            select(Employee.employee_code).order_by(Employee.id.desc()).limit(1)
        )
        if latest:
            digits = "".join(ch for ch in latest if ch.isdigit())
            if digits:
                row.code_next_number = int(digits) + 1
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def with_preview(row: EmployeeSettings) -> EmployeeSettingsOut:
    out = EmployeeSettingsOut.model_validate(row)
    out.preview = [
        employee_codes.build(row.code_pattern, row.code_next_number + i, row.code_padding)
        for i in range(3)
    ]
    return out


@router.get("/employee", response_model=EmployeeSettingsOut)
def read_employee_settings(
    db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    return with_preview(employee_settings(db))


@router.put("/employee", response_model=EmployeeSettingsOut)
def update_employee_settings(
    payload: EmployeeSettingsUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = employee_settings(db)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return with_preview(row)


@router.get("/employee/code-tokens", response_model=list[CodeTokenOut])
def code_tokens(_: Admin = Depends(current_admin)):
    return [
        CodeTokenOut(token=token, description=description)
        for token, description in employee_codes.TOKENS.items()
    ]


@router.post("/employee/code-preview", response_model=list[str])
def code_preview(
    payload: CodePreviewRequest, _: Admin = Depends(current_admin)
):
    """Preview an unsaved pattern, so a mistake is visible before saving."""
    try:
        pattern = employee_codes.validate(payload.code_pattern)
    except ValueError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)
        ) from None

    return [
        employee_codes.build(
            pattern, payload.code_next_number + i, payload.code_padding
        )
        for i in range(3)
    ]

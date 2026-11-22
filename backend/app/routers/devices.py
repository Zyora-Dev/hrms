"""Biometric terminals: register them, test them, pull their punches."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, BiometricDevice, Employee
from app.routers.attendance_router import store_punches
from app.routers.auth import current_admin
from app.schemas import (
    DeviceCreate,
    DeviceFetchResult,
    DeviceOut,
    DeviceTestResult,
    PunchIn,
)
from app.services import attendance_service as svc
from app.services import biometric

router = APIRouter(prefix="/devices", tags=["devices"])

# How far back a first fetch reaches when the device has never been synced.
FIRST_FETCH_DAYS = 30


def get_device(db: Session, device_id: int) -> BiometricDevice:
    device = db.get(BiometricDevice, device_id)
    if not device:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    return device


def employee_lookup(db: Session) -> dict[str, Employee]:
    """Device user id → employee, falling back to the employee code.

    Terminals store a number per person. Sites usually enrol people under
    their employee code, so both are accepted and the explicit mapping wins.
    """
    table: dict[str, Employee] = {}
    for employee in db.scalars(select(Employee)):
        if employee.employee_code:
            table.setdefault(employee.employee_code.strip().lower(), employee)
            # "EMP-0007" enrolled as "7" on the keypad.
            digits = employee.employee_code.strip().lstrip("0")
            trailing = "".join(ch for ch in employee.employee_code if ch.isdigit())
            for key in (digits, trailing, trailing.lstrip("0")):
                if key:
                    table.setdefault(key.lower(), employee)
    # Explicit mapping overwrites anything guessed above.
    for employee in db.scalars(
        select(Employee).where(Employee.device_user_id.is_not(None))
    ):
        key = (employee.device_user_id or "").strip().lower()
        if key:
            table[key] = employee
    return table


@router.get("", response_model=list[DeviceOut])
def list_devices(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    return list(db.scalars(select(BiometricDevice).order_by(BiometricDevice.name)))


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    clash = db.scalar(
        select(BiometricDevice).where(
            func.lower(BiometricDevice.host) == payload.host.lower(),
            BiometricDevice.port == payload.port,
        )
    )
    if clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{clash.name} is already registered on {payload.host}:{payload.port}",
        )

    device = BiometricDevice(**payload.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.put("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: int,
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    device = get_device(db, device_id)
    for field, value in payload.model_dump().items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    db.delete(get_device(db, device_id))
    db.commit()


@router.post("/{device_id}/test", response_model=DeviceTestResult)
def test_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Say hello and report what the terminal says back."""
    device = get_device(db, device_id)

    try:
        info = biometric.test(device)
    except biometric.DeviceError as exc:
        device.last_error = str(exc)[:255]
        db.commit()
        return DeviceTestResult(reachable=False, message=str(exc))

    device.serial_number = info.serial_number
    device.model = info.model
    device.last_error = None
    db.commit()

    drift = None
    if info.device_time:
        # Terminals keep local wall-clock time with no zone, so compare
        # against the organisation's wall clock rather than UTC.
        here = datetime.now(svc.tz()).replace(tzinfo=None)
        drift = int(round((info.device_time - here).total_seconds() / 60))

    return DeviceTestResult(
        reachable=True,
        serial_number=info.serial_number,
        model=info.model,
        firmware=info.firmware,
        platform=info.platform,
        device_time=info.device_time,
        users=info.users,
        records=info.records,
        clock_drift_minutes=drift,
    )


@router.post("/{device_id}/fetch", response_model=DeviceFetchResult)
def fetch_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    full: bool = False,
):
    """Pull the log and file every punch, then rebuild the days they touch.

    Only punches newer than the last one already taken from this device are
    considered, unless `full` is set. Re-running is harmless either way: a
    punch already stored is dropped as a duplicate.
    """
    device = get_device(db, device_id)
    zone = svc.tz()

    since = None
    if not full:
        since = device.last_punch_at or (
            datetime.now(zone) - timedelta(days=FIRST_FETCH_DAYS)
        )
        since = since.astimezone(zone).replace(tzinfo=None)

    try:
        result = biometric.fetch(device, since)
    except biometric.DeviceError as exc:
        device.last_error = str(exc)[:255]
        db.commit()
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    people = employee_lookup(db)
    items: list[PunchIn] = []
    unknown: list[str] = []

    for log in sorted(result.logs, key=lambda entry: entry.punched_at):
        employee = people.get(log.user_id.strip().lower())
        if employee is None:
            if log.user_id not in unknown:
                unknown.append(log.user_id)
            continue

        stamp = log.punched_at.replace(tzinfo=zone)
        items.append(
            PunchIn(
                employee_id=employee.id,
                punch_at=stamp,
                direction=biometric.direction_of(log),
                source="biometric",
                device_id=device.serial_number or device.name,
                # Same person, same second, same terminal is the same punch.
                external_id=f"{device.id}:{log.user_id}:{stamp:%Y%m%d%H%M%S}",
            )
        )

    stored = store_punches(db, items) if items else None

    device.last_sync_at = datetime.now(zone)
    if items:
        device.last_punch_at = max(item.punch_at for item in items)
    if result.info.serial_number:
        device.serial_number = result.info.serial_number
    if result.info.model:
        device.model = result.info.model
    device.last_error = (
        f"{len(unknown)} unknown device user(s): {', '.join(unknown[:5])}"
        if unknown
        else None
    )
    db.commit()

    return DeviceFetchResult(
        received=len(result.logs),
        stored=stored.stored if stored else 0,
        duplicates=stored.duplicates if stored else 0,
        unmatched=unknown,
        recomputed_days=stored.recomputed_days if stored else 0,
        first_punch_at=min((i.punch_at for i in items), default=None),
        last_punch_at=max((i.punch_at for i in items), default=None),
    )


@router.post("/fetch-all", response_model=list[DeviceFetchResult])
def fetch_all(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Every active device in turn. One being offline does not stop the rest."""
    out = []
    for device in db.scalars(
        select(BiometricDevice).where(BiometricDevice.is_active.is_(True))
    ):
        try:
            out.append(fetch_device(device.id, db=db, _=_, full=False))
        except HTTPException:
            out.append(DeviceFetchResult())
    return out

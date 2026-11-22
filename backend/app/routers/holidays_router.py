from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, Holiday
from app.routers.auth import current_admin
from app.schemas import (
    HolidayBulk,
    HolidayCreate,
    HolidayImportResult,
    HolidayOut,
)

router = APIRouter(prefix="/holidays", tags=["holidays"])

WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def to_out(row: Holiday) -> HolidayOut:
    out = HolidayOut.model_validate(row)
    out.weekday = WEEKDAYS[row.holiday_date.weekday()]
    return out


def clashes(db: Session, payload: HolidayCreate, exclude_id: int | None = None):
    stmt = select(Holiday).where(
        Holiday.holiday_date == payload.holiday_date,
        func.lower(Holiday.name) == payload.name.lower(),
    )
    # A null location means "everywhere", so it collides with any entry.
    if payload.location:
        stmt = stmt.where(
            (Holiday.location.is_(None))
            | (func.lower(Holiday.location) == payload.location.lower())
        )
    if exclude_id is not None:
        stmt = stmt.where(Holiday.id != exclude_id)
    return db.scalar(stmt)


@router.get("", response_model=list[HolidayOut])
def list_holidays(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    year: int | None = Query(default=None, ge=1970, le=2200),
    location: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    stmt = select(Holiday)

    if year is not None:
        stmt = stmt.where(
            Holiday.holiday_date >= date(year, 1, 1),
            Holiday.holiday_date <= date(year, 12, 31),
        )
    if date_from:
        stmt = stmt.where(Holiday.holiday_date >= date_from)
    if date_to:
        stmt = stmt.where(Holiday.holiday_date <= date_to)
    if location:
        stmt = stmt.where(
            (Holiday.location.is_(None))
            | (func.lower(Holiday.location) == location.lower())
        )

    return [to_out(r) for r in db.scalars(stmt.order_by(Holiday.holiday_date))]


@router.get("/years", response_model=list[int])
def holiday_years(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    rows = db.scalars(
        select(func.distinct(func.extract("year", Holiday.holiday_date))).order_by(
            func.extract("year", Holiday.holiday_date).desc()
        )
    )
    return [int(r) for r in rows]


@router.post("", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if clashes(db, payload):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"“{payload.name}” is already set for {payload.holiday_date}",
        )

    row = Holiday(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_out(row)


@router.put("/{holiday_id}", response_model=HolidayOut)
def update_holiday(
    holiday_id: int,
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(Holiday, holiday_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    if clashes(db, payload, exclude_id=holiday_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Another entry already covers that date"
        )

    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return to_out(row)


@router.delete("/{holiday_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_holiday(
    holiday_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(Holiday, holiday_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Holiday not found")
    db.delete(row)
    db.commit()


@router.post("/bulk", response_model=HolidayImportResult)
def bulk_holidays(
    payload: HolidayBulk,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    """Add a year's list in one go. Duplicates are skipped, not errors."""
    removed = 0
    if payload.replace_year is not None:
        year = payload.replace_year
        existing = db.scalars(
            select(Holiday).where(
                Holiday.holiday_date >= date(year, 1, 1),
                Holiday.holiday_date <= date(year, 12, 31),
            )
        ).all()
        removed = len(existing)
        for row in existing:
            db.delete(row)
        db.flush()

    added = skipped = 0
    for item in payload.holidays:
        if clashes(db, item):
            skipped += 1
            continue
        db.add(Holiday(**item.model_dump()))
        db.flush()
        added += 1

    db.commit()
    return HolidayImportResult(added=added, skipped=skipped, removed=removed)

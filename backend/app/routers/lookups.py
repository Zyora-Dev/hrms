"""Departments and designations — small admin-managed lookup lists.

Both behave identically, so one generic implementation is mounted twice.
"""

from typing import Type

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, Department, Designation, Employee
from app.routers.auth import current_admin
from app.schemas import LookupCreate, LookupOut, LookupUpdate

# Prefixed so the catch-all /{kind} path can't shadow other top-level routes.
router = APIRouter(prefix="/lookups", tags=["lookups"])

# model -> the Employee column that references it
LOOKUPS: dict[str, tuple[Type[Department | Designation], object]] = {
    "departments": (Department, Employee.department_id),
    "designations": (Designation, Employee.designation_id),
}


def resolve(kind: str):
    try:
        return LOOKUPS[kind]
    except KeyError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown lookup") from None


def usage_counts(db: Session, fk_column) -> dict[int, int]:
    rows = db.execute(
        select(fk_column, func.count())
        .where(fk_column.is_not(None))
        .group_by(fk_column)
    ).all()
    return {row[0]: row[1] for row in rows}


def find_by_name(db: Session, model, name: str, exclude_id: int | None = None):
    stmt = select(model).where(func.lower(model.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(model.id != exclude_id)
    return db.scalar(stmt)


@router.get("/{kind}", response_model=list[LookupOut])
def list_lookup(
    kind: str,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    include_inactive: bool = Query(default=False),
):
    model, fk = resolve(kind)

    stmt = select(model)
    if not include_inactive:
        stmt = stmt.where(model.is_active.is_(True))

    counts = usage_counts(db, fk)
    items = []
    for row in db.scalars(stmt.order_by(func.lower(model.name))):
        out = LookupOut.model_validate(row)
        out.in_use = counts.get(row.id, 0)
        items.append(out)
    return items


@router.post("/{kind}", response_model=LookupOut, status_code=status.HTTP_201_CREATED)
def create_lookup(
    kind: str,
    payload: LookupCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    model, _fk = resolve(kind)

    existing = find_by_name(db, model, payload.name)
    if existing:
        # Re-activating beats creating a near-duplicate.
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return LookupOut.model_validate(existing)
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"“{existing.name}” already exists"
        )

    row = model(name=payload.name)
    db.add(row)
    db.commit()
    db.refresh(row)
    return LookupOut.model_validate(row)


@router.put("/{kind}/{item_id}", response_model=LookupOut)
def update_lookup(
    kind: str,
    item_id: int,
    payload: LookupUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    model, fk = resolve(kind)

    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    if find_by_name(db, model, payload.name, exclude_id=item_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"“{payload.name}” already exists"
        )

    row.name = payload.name
    row.is_active = payload.is_active
    db.commit()
    db.refresh(row)

    out = LookupOut.model_validate(row)
    out.in_use = usage_counts(db, fk).get(row.id, 0)
    return out


@router.delete("/{kind}/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lookup(
    kind: str,
    item_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    model, fk = resolve(kind)

    row = db.get(model, item_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    in_use = usage_counts(db, fk).get(row.id, 0)
    if in_use:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"“{row.name}” is assigned to {in_use} "
            f"employee{'s' if in_use != 1 else ''}. Deactivate it instead.",
        )

    db.delete(row)
    db.commit()

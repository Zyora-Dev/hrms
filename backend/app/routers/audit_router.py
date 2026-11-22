"""Reading the audit trail. Nothing here writes to it, and nothing deletes."""

import csv
import io
from datetime import date, datetime, timedelta
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, AuditLog
from app.routers.auth import current_admin
from app.schemas import AuditEntryOut, AuditFacets, AuditPage
from app.services import attendance_service as svc

router = APIRouter(prefix="/audit", tags=["audit"])


def filtered(
    date_from: date | None,
    date_to: date | None,
    action: str | None,
    entity: str | None,
    admin_email: str | None,
    entity_id: str | None,
    q: str | None,
):
    zone = svc.tz()
    stmt = select(AuditLog)

    if date_from:
        stmt = stmt.where(
            AuditLog.at
            >= datetime.combine(date_from, datetime.min.time()).replace(tzinfo=zone)
        )
    if date_to:
        stmt = stmt.where(
            AuditLog.at
            < datetime.combine(
                date_to + timedelta(days=1), datetime.min.time()
            ).replace(tzinfo=zone)
        )
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    if admin_email:
        stmt = stmt.where(func.lower(AuditLog.admin_email) == admin_email.lower())
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(AuditLog.label).like(term),
                func.lower(AuditLog.summary).like(term),
                func.lower(AuditLog.admin_email).like(term),
                func.lower(AuditLog.entity).like(term),
                func.lower(AuditLog.path).like(term),
            )
        )
    return stmt


@router.get("", response_model=AuditPage)
def list_audit(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    action: str | None = None,
    entity: str | None = None,
    admin_email: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = filtered(date_from, date_to, action, entity, admin_email, entity_id, q)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    rows = list(
        db.scalars(
            stmt.order_by(AuditLog.at.desc(), AuditLog.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )

    return AuditPage(
        items=[AuditEntryOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.get("/facets", response_model=AuditFacets)
def facets(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    """What is actually in the trail, for the filter dropdowns."""
    return AuditFacets(
        actions=[
            r for r in db.scalars(select(AuditLog.action).distinct().order_by(AuditLog.action))
        ],
        entities=[
            r for r in db.scalars(select(AuditLog.entity).distinct().order_by(AuditLog.entity))
        ],
        admins=[
            r
            for r in db.scalars(
                select(AuditLog.admin_email)
                .where(AuditLog.admin_email.is_not(None))
                .distinct()
                .order_by(AuditLog.admin_email)
            )
        ],
    )


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    action: str | None = None,
    entity: str | None = None,
    admin_email: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
):
    stmt = filtered(date_from, date_to, action, entity, admin_email, entity_id, q)
    rows = list(
        db.scalars(stmt.order_by(AuditLog.at.desc(), AuditLog.id.desc()).limit(10_000))
    )

    zone = svc.tz()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["When", "Who", "Action", "Record", "Name", "Id", "What changed", "From", "To", "IP"]
    )

    for row in rows:
        when = row.at.astimezone(zone).strftime("%Y-%m-%d %H:%M:%S")
        if row.changes:
            for field, change in row.changes.items():
                writer.writerow(
                    [
                        when,
                        row.admin_email or "",
                        row.action,
                        row.entity,
                        row.label or "",
                        row.entity_id or "",
                        field,
                        change.get("from") if isinstance(change, dict) else "",
                        change.get("to") if isinstance(change, dict) else "",
                        row.ip_address or "",
                    ]
                )
        else:
            writer.writerow(
                [
                    when,
                    row.admin_email or "",
                    row.action,
                    row.entity,
                    row.label or "",
                    row.entity_id or "",
                    row.summary or "",
                    "",
                    "",
                    row.ip_address or "",
                ]
            )

    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="audit-trail.csv"'},
    )


@router.get("/{entry_id}", response_model=AuditEntryOut)
def get_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(AuditLog, entry_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Entry not found")
    return row

"""The notification centre, and the counts that sit beside the menu."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, LeaveRequest, Notification, ReimbursementClaim
from app.routers.auth import current_admin
from app.schemas import NotificationOut, NotificationSummary, PendingCounts

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    unread_only: bool = False,
    limit: int = Query(default=30, ge=1, le=100),
):
    # Employee-addressed rows belong to the portal, not this bell.
    stmt = select(Notification).where(Notification.employee_id.is_(None))
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    return list(
        db.scalars(stmt.order_by(Notification.created_at.desc()).limit(limit))
    )


@router.get("/summary", response_model=NotificationSummary)
def summary(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    """Unread for the bell, and what is still waiting for the badges.

    The two differ on purpose: reading a notification does not approve the
    leave it was about.
    """
    return NotificationSummary(
        unread=db.scalar(
            select(func.count(Notification.id)).where(
                Notification.read_at.is_(None),
                Notification.employee_id.is_(None),
            )
        )
        or 0,
        pending=PendingCounts(
            leave=db.scalar(
                select(func.count(LeaveRequest.id)).where(
                    LeaveRequest.status == "pending"
                )
            )
            or 0,
            claims=db.scalar(
                select(func.count(ReimbursementClaim.id)).where(
                    ReimbursementClaim.status == "pending"
                )
            )
            or 0,
        ),
    )


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(Notification, notification_id)
    if not row or row.employee_id is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    if row.read_at is None:
        row.read_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(row)
    return row


@router.post("/read-all", response_model=NotificationSummary)
def mark_all_read(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    now = datetime.now(timezone.utc)
    for row in db.scalars(
        select(Notification).where(
            Notification.read_at.is_(None), Notification.employee_id.is_(None)
        )
    ):
        row.read_at = now
    db.commit()
    return summary(db=db, _=_)

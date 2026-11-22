"""Mail settings, the outbox, and a way to prove it works."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, mailer
from app.config import settings
from app.db import get_db
from app.models import Admin, EmailMessage
from app.routers.auth import current_admin
from app.schemas import (
    EmailMessageOut,
    EmailSettingsBase,
    EmailSettingsOut,
    EmailTest,
)

router = APIRouter(prefix="/email", tags=["email"])


def to_out(db: Session) -> EmailSettingsOut:
    row = mailer.config(db)
    out = EmailSettingsOut.model_validate(row)

    out.provider_ready = mailer.provider_ready()
    out.provider_url = settings.ZOHO_CPAAS_URL
    out.env_from_address = settings.MAIL_FROM_ADDRESS

    since = datetime.now(timezone.utc) - timedelta(days=1)
    out.queued = (
        db.scalar(
            select(func.count(EmailMessage.id)).where(EmailMessage.status == "queued")
        )
        or 0
    )
    out.failed = (
        db.scalar(
            select(func.count(EmailMessage.id)).where(EmailMessage.status == "failed")
        )
        or 0
    )
    out.sent_today = (
        db.scalar(
            select(func.count(EmailMessage.id)).where(
                EmailMessage.status == "sent", EmailMessage.sent_at >= since
            )
        )
        or 0
    )
    return out


@router.get("/settings", response_model=EmailSettingsOut)
def read_settings(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    return to_out(db)


@router.put("/settings", response_model=EmailSettingsOut)
def save_settings(
    payload: EmailSettingsBase,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = mailer.config(db)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)

    audit.record(
        db,
        action="update",
        entity="email_settings",
        entity_id=row.id,
        label="Email",
        summary=("Switched on" if row.is_enabled else "Switched off"),
        commit=False,
    )
    db.commit()
    return to_out(db)


@router.post("/test", response_model=dict)
def test(
    payload: EmailTest,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Send one message straight away, so a mistake shows up here."""
    try:
        message = mailer.send_test(db, str(payload.to_email))
    except Exception as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc

    audit.record(
        db,
        action="action",
        entity="email_settings",
        label=str(payload.to_email),
        summary="Test email sent",
    )
    return {"message": message}


@router.get("/outbox", response_model=list[EmailMessageOut])
def outbox(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    message_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
):
    stmt = select(EmailMessage)
    if message_status:
        stmt = stmt.where(EmailMessage.status == message_status)
    return list(
        db.scalars(stmt.order_by(EmailMessage.created_at.desc()).limit(limit))
    )


@router.post("/outbox/flush", response_model=dict)
def flush(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    sent, failed = mailer.flush(db, limit=50)
    return {"sent": sent, "failed": failed}


@router.post("/outbox/{message_id}/retry", response_model=EmailMessageOut)
def retry(
    message_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(EmailMessage, message_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")

    # A retry starts the attempt count again, otherwise one that already hit
    # the ceiling would be refused by the flush immediately.
    row.status = "queued"
    row.attempts = 0
    row.last_error = None
    db.commit()

    mailer.flush(db, limit=5)
    db.refresh(row)
    return row

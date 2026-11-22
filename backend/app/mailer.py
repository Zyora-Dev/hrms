"""Outgoing mail, through Zoho CPaaS.

Nothing is sent inside the request that caused it. A leave approval writes a
row to the outbox and returns; a background flush does the talking to Zoho.
That way a slow or unreachable mail service cannot make approving leave hang,
and a message that fails is still sitting there to retry.

The API key lives in `.env` and never in the database — a credential that can
send mail as the company should not be editable from a browser session.
"""

import base64
import json
import logging
import urllib.error
import urllib.request
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import EmailMessage, EmailSettings

log = logging.getLogger("hrms.mailer")

TIMEOUT_SECONDS = 20
MAX_ATTEMPTS = 5
UPLOAD_ROOT = settings.upload_dir

BRAND = "#072869"


def config(db: Session) -> EmailSettings:
    row = db.scalar(select(EmailSettings).order_by(EmailSettings.id).limit(1))
    if row is None:
        row = EmailSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


PREFIX = "Zoho-enczapikey"


def provider_ready() -> bool:
    return bool(settings.ZOHO_CPAAS_KEY and settings.MAIL_FROM_ADDRESS)


def auth_header() -> str:
    """Zoho wants `Zoho-enczapikey <key>`.

    The value is taken whole when it already carries the prefix — Zoho's own
    docs show it as part of the header, so that is how most people paste it,
    and prefixing it twice is rejected with an empty 500 that explains
    nothing.
    """
    key = (settings.ZOHO_CPAAS_KEY or "").strip()
    return key if key.startswith(PREFIX) else f"{PREFIX} {key}"


def sender(row: EmailSettings) -> tuple[str, str]:
    return (
        row.from_email or settings.MAIL_FROM_ADDRESS or "",
        row.from_name or settings.MAIL_FROM_NAME,
    )


# ---------------------------------------------------------------------------
# Composing
# ---------------------------------------------------------------------------


def layout(title: str, lines: list[str], action: tuple[str, str] | None = None) -> str:
    """One house style, so every message looks like it came from the same place."""
    body = "".join(
        f'<p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#111">{line}</p>'
        for line in lines
    )
    button = ""
    if action:
        label, href = action
        button = (
            f'<a href="{href}" style="display:inline-block;margin-top:8px;'
            f"background:{BRAND};color:#fff;text-decoration:none;padding:10px 18px;"
            f'border-radius:8px;font-size:14px;font-weight:600">{label}</a>'
        )

    return f"""<div style="background:#f4f6fb;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;
              padding:28px;font-family:Helvetica,Arial,sans-serif">
    <h1 style="margin:0 0 16px 0;font-size:18px;color:{BRAND}">{title}</h1>
    {body}
    {button}
    <p style="margin:24px 0 0 0;font-size:11px;color:#667">
      Sent by your HR system. Replies go to your HR team.
    </p>
  </div>
</div>"""


def plain(lines: list[str]) -> str:
    return "\n\n".join(lines)


def queue(
    db: Session,
    *,
    kind: str,
    to_email: str | None,
    subject: str,
    lines: list[str],
    to_name: str | None = None,
    action: tuple[str, str] | None = None,
    attachments: list[dict] | None = None,
    entity: str | None = None,
    entity_id: int | None = None,
    commit: bool = False,
) -> EmailMessage | None:
    """Put a message in the outbox. Returns None when mail is switched off."""
    row = config(db)
    if not row.is_enabled or not to_email:
        return None

    message = EmailMessage(
        kind=kind,
        to_email=(row.redirect_to or to_email).strip(),
        to_name=to_name,
        subject=subject[:255],
        body_html=layout(subject, lines, action),
        body_text=plain(lines),
        attachments=attachments or [],
        entity=entity,
        entity_id=entity_id,
    )
    db.add(message)
    if commit:
        db.commit()
    return message


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------


def encode_attachment(item: dict) -> dict | None:
    """Zoho takes attachments inline, base64 encoded."""
    public = str(item.get("path", ""))
    if not public.startswith("/uploads/"):
        return None

    path = UPLOAD_ROOT / public.removeprefix("/uploads/")
    if not path.is_file():
        return None

    return {
        "name": item.get("filename") or path.name,
        "mime_type": item.get("mime_type", "application/pdf"),
        "content": base64.b64encode(path.read_bytes()).decode(),
    }


def deliver(row: EmailSettings, message: EmailMessage) -> None:
    """Hand one message to Zoho. Raises on anything other than success."""
    address, name = sender(row)
    if not address:
        raise RuntimeError("No from-address is configured")

    payload: dict = {
        "from": {"address": address, "name": name},
        "to": [
            {
                "email_address": {
                    "address": message.to_email,
                    "name": message.to_name or message.to_email,
                }
            }
        ],
        "subject": message.subject,
        "htmlbody": message.body_html,
    }
    if message.body_text:
        payload["textbody"] = message.body_text

    reply_to = row.reply_to or settings.MAIL_REPLY_TO
    if reply_to:
        payload["reply_to"] = [{"address": reply_to}]

    files = [a for a in (encode_attachment(i) for i in message.attachments or []) if a]
    if files:
        payload["attachments"] = files

    request = urllib.request.Request(
        settings.ZOHO_CPAAS_URL,
        method="POST",
        data=json.dumps(payload).encode(),
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "authorization": auth_header(),
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise RuntimeError(f"Zoho refused it ({exc.code}): {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Zoho: {exc.reason}") from exc


def flush(db: Session, limit: int = 25) -> tuple[int, int]:
    """Send what is waiting. Returns (sent, failed)."""
    row = config(db)
    if not row.is_enabled or not provider_ready():
        return (0, 0)

    pending = list(
        db.scalars(
            select(EmailMessage)
            .where(
                EmailMessage.status == "queued",
                EmailMessage.attempts < MAX_ATTEMPTS,
            )
            .order_by(EmailMessage.created_at)
            .limit(limit)
        )
    )

    sent = failed = 0
    for message in pending:
        message.attempts += 1
        try:
            deliver(row, message)
            message.status = "sent"
            message.sent_at = datetime.now(timezone.utc)
            message.last_error = None
            sent += 1
        except Exception as exc:
            message.last_error = str(exc)[:400]
            # Give up only after enough tries that it is clearly not a blip.
            if message.attempts >= MAX_ATTEMPTS:
                message.status = "failed"
            failed += 1
            log.warning("email %s failed: %s", message.id, message.last_error)

    db.commit()
    return (sent, failed)


def send_test(db: Session, to_email: str) -> str:
    """Send one message immediately and say what happened."""
    if not provider_ready():
        raise RuntimeError(
            "Set ZOHO_CPAAS_KEY and MAIL_FROM_ADDRESS in .env first"
        )

    row = config(db)
    message = EmailMessage(
        kind="test",
        to_email=to_email,
        subject="HRMS test email",
        body_html=layout(
            "It works",
            [
                "This is a test from your HR system.",
                "If you are reading it, outgoing mail is set up correctly.",
            ],
        ),
        body_text="This is a test from your HR system.",
    )
    db.add(message)
    db.flush()

    message.attempts = 1
    try:
        deliver(row, message)
        message.status = "sent"
        message.sent_at = datetime.now(timezone.utc)
        db.commit()
        return f"Sent to {to_email}"
    except Exception as exc:
        message.status = "failed"
        message.last_error = str(exc)[:400]
        db.commit()
        raise

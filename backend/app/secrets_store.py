"""Encrypting the handful of fields that must not sit in the clear.

Aadhaar is the reason this exists. It cannot simply be hashed: PF and ESI
filings need the number itself, so it has to come back out again. What it
must never be is readable to anyone who gets a copy of the database, so it is
encrypted at rest and only ever shown in full to an admin who asks for it —
an act that lands in the audit trail.

The last four digits are kept alongside in the clear, because every screen
that shows an Aadhaar shows only those, and searching on them is useful.
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.config import settings


def _key() -> bytes:
    configured = settings.DATA_ENCRYPTION_KEY
    if configured:
        return configured.encode()
    # Derived rather than random, so the same install keeps reading its own
    # data after a restart without anyone having to set a second secret.
    digest = hashlib.sha256(f"hrms-data:{settings.JWT_SECRET}".encode()).digest()
    return base64.urlsafe_b64encode(digest)


def encrypt(value: str | None) -> str | None:
    if not value:
        return None
    return Fernet(_key()).encrypt(value.strip().encode()).decode()


def decrypt(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return Fernet(_key()).decrypt(value.encode()).decode()
    except InvalidToken:
        # Written with a different key, or not encrypted at all.
        return None


def last4(value: str | None) -> str | None:
    if not value:
        return None
    digits = "".join(ch for ch in value if ch.isdigit())
    return digits[-4:] if len(digits) >= 4 else None


def masked(tail: str | None, length: int = 12) -> str | None:
    """"••••••••9012" — what every screen shows."""
    if not tail:
        return None
    return f"{'•' * max(length - len(tail), 0)}{tail}"

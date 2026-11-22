import re
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import settings

# A second-step code is useless for anything else, so its window is short.
CHALLENGE_MINUTES = 5
BACKUP_CODE_COUNT = 10


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def password_problem(password: str) -> str | None:
    """Why this password will not do, or None if it is fine."""
    if len(password) < 10:
        return "Use at least 10 characters"
    if not re.search(r"[A-Za-z]", password):
        return "Include at least one letter"
    if not re.search(r"\d", password):
        return "Include at least one number"
    if password.lower() in {"password12", "password123", "admin12345"}:
        return "That password is too easy to guess"
    return None


def new_jti() -> str:
    return secrets.token_urlsafe(24)


def create_access_token(subject: str, jti: str) -> tuple[str, datetime]:
    """Issue a JWT valid for JWT_EXPIRE_DAYS, tied to one session."""
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "jti": jti,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def create_employee_token(subject: str, jti: str) -> tuple[str, datetime]:
    """Same shape as an admin token, but marked so the two cannot be swapped.

    An employee token presented to an admin endpoint is rejected on its type
    alone, before anything looks the subject up.
    """
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "jti": jti,
        "exp": expires_at,
        "iat": datetime.now(timezone.utc),
        "type": "employee",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expires_at


def create_challenge_token(subject: str) -> str:
    """Proof of a correct password, pending the second step."""
    payload = {
        "sub": subject,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=CHALLENGE_MINUTES),
        "iat": datetime.now(timezone.utc),
        "type": "mfa_challenge",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])


# ---------------------------------------------------------------------------
# Backup codes
# ---------------------------------------------------------------------------


def generate_backup_codes(count: int = BACKUP_CODE_COUNT) -> list[str]:
    """Readable one-time codes, shown once and stored only as hashes."""
    return [
        f"{secrets.token_hex(2)}-{secrets.token_hex(2)}".upper()
        for _ in range(count)
    ]


def hash_backup_codes(codes: list[str]) -> list[str]:
    return [hash_password(code) for code in codes]


def consume_backup_code(code: str, hashes: list[str]) -> list[str] | None:
    """Returns the remaining hashes if the code matched, otherwise None."""
    cleaned = code.strip().upper()
    for stored in hashes:
        if verify_password(cleaned, stored):
            return [h for h in hashes if h != stored]
    return None


# ---------------------------------------------------------------------------
# Describing a device from its user agent
# ---------------------------------------------------------------------------

BROWSERS = [
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("Chrome/", "Chrome"),
    ("Safari/", "Safari"),
    ("Firefox/", "Firefox"),
]

PLATFORMS = [
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Mac OS X", "Mac"),
    ("Windows", "Windows"),
    ("Linux", "Linux"),
]


def describe_device(user_agent: str | None) -> str:
    """"Chrome on Mac" — enough to recognise your own sessions."""
    if not user_agent:
        return "Unknown device"

    browser = next((name for token, name in BROWSERS if token in user_agent), None)
    platform = next((name for token, name in PLATFORMS if token in user_agent), None)

    if browser and platform:
        return f"{browser} on {platform}"
    return browser or platform or "Unknown device"

from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit, throttle
from app.db import get_db
from app.models import Admin, AdminSession
from app.schemas import AdminLogin, AdminOut, LoginResult, MfaLogin
from app.security import (
    consume_backup_code,
    create_access_token,
    create_challenge_token,
    decode_token,
    describe_device,
    new_jti,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer = HTTPBearer(auto_error=True)


def fail(db: Session, admin: Admin | None, email: str, why: str, code: int):
    audit.set_admin(admin.id if admin else None, email)
    audit.record(
        db,
        action="login_failed",
        entity="admin_auth",
        entity_id=admin.id if admin else None,
        label=email,
        summary=why,
    )
    raise HTTPException(
        code,
        "Invalid email or password" if code == status.HTTP_401_UNAUTHORIZED else why,
    )


def start_session(db: Session, admin: Admin, request: Request) -> LoginResult:
    """Issue a token and the session row that can switch it off again."""
    jti = new_jti()
    token, expires_at = create_access_token(str(admin.id), jti)

    user_agent = request.headers.get("user-agent") if request else None
    db.add(
        AdminSession(
            admin_id=admin.id,
            jti=jti,
            ip_address=request.client.host if request and request.client else None,
            user_agent=(user_agent or "")[:255] or None,
            device=describe_device(user_agent),
            expires_at=expires_at,
        )
    )

    audit.set_admin(admin.id, admin.email)
    audit.record(
        db,
        action="login",
        entity="admin_auth",
        entity_id=admin.id,
        label=admin.email,
        summary=f"Signed in from {describe_device(user_agent)}",
    )
    return LoginResult(access_token=token, expires_at=expires_at)


@router.post("/login", response_model=LoginResult)
def login(payload: AdminLogin, request: Request, db: Session = Depends(get_db)):
    email = payload.email.lower()
    address = request.client.host if request and request.client else None

    verdict = throttle.check_address(address)
    if not verdict.allowed:
        audit.set_admin(None, email)
        audit.record(
            db,
            action="login_failed",
            entity="admin_auth",
            label=email,
            summary=f"Blocked: {verdict.reason}",
        )
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            verdict.reason,
            headers={"Retry-After": str(verdict.retry_after)},
        )

    admin = db.scalar(select(Admin).where(Admin.email == email))

    if not admin or not verify_password(payload.password, admin.password_hash):
        # Failed attempts are the half of the trail that matters most.
        throttle.record_failure(email, address)

        spent = throttle.check_account(email)
        if not spent.allowed:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                spent.reason,
                headers={"Retry-After": str(spent.retry_after)},
            )

        fail(
            db,
            admin,
            email,
            "Wrong password" if admin else "No such account",
            status.HTTP_401_UNAUTHORIZED,
        )

    if not admin.is_active:
        throttle.record_failure(email, address)
        fail(db, admin, email, "Account is disabled", status.HTTP_403_FORBIDDEN)

    throttle.record_success(email, address)

    if admin.totp_enabled:
        # The password alone opens nothing: it only earns the right to be
        # asked for a code, and that right expires in minutes.
        return LoginResult(
            mfa_required=True, challenge_token=create_challenge_token(str(admin.id))
        )

    return start_session(db, admin, request)


@router.post("/login/mfa", response_model=LoginResult)
def login_mfa(payload: MfaLogin, request: Request, db: Session = Depends(get_db)):
    """Second step: a code from the authenticator, or a backup code."""
    import pyotp

    try:
        claims = decode_token(payload.challenge_token)
        if claims.get("type") != "mfa_challenge":
            raise jwt.InvalidTokenError("wrong token type")
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "That took too long — sign in again"
        ) from None
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid sign-in") from None

    admin = db.get(Admin, int(claims["sub"]))
    if not admin or not admin.is_active or not admin.totp_enabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid sign-in")

    code = payload.code.strip().replace(" ", "")

    # A valid authenticator code, or one of the printed backup codes.
    ok = pyotp.TOTP(admin.totp_secret).verify(code, valid_window=1)
    if not ok:
        remaining = consume_backup_code(code, admin.backup_codes or [])
        if remaining is None:
            audit.set_admin(admin.id, admin.email)
            audit.record(
                db,
                action="login_failed",
                entity="admin_auth",
                entity_id=admin.id,
                label=admin.email,
                summary="Wrong two-step code",
            )
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That code is not right")

        admin.backup_codes = remaining
        audit.record(
            db,
            action="action",
            entity="admin_auth",
            entity_id=admin.id,
            label=admin.email,
            summary=f"Signed in with a backup code · {len(remaining)} left",
            commit=False,
        )

    result = start_session(db, admin, request)
    db.commit()
    return result


def current_admin(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> Admin:
    try:
        payload = decode_token(creds.credentials)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired") from None
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token") from None

    if payload.get("type") != "access":
        # An employee token must not open an admin door.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    admin = db.get(Admin, int(payload["sub"]))
    if not admin or not admin.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    jti = payload.get("jti")
    if jti:
        session = db.scalar(select(AdminSession).where(AdminSession.jti == jti))
        if session is None or session.revoked_at is not None:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "This device was signed out"
            )
        # Cheap enough to keep the list honest about what is still in use.
        session.last_seen_at = datetime.now(timezone.utc)
        db.commit()

    # Everything the request goes on to change is attributed to this admin.
    audit.set_admin(admin.id, admin.email)
    audit.current().extra["jti"] = jti
    return admin


@router.get("/me", response_model=AdminOut)
def me(admin: Admin = Depends(current_admin)):
    return admin

"""The signed-in admin's own account: password, two-step sign-in, devices."""

import base64
import io
from datetime import datetime, timezone

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.models import Admin, AdminSession
from app.routers.auth import current_admin
from app.schemas import (
    AccountOut,
    BackupCodesOut,
    MfaDisable,
    MfaSetupOut,
    MfaVerify,
    PasswordChange,
    ProfileUpdate,
    SessionOut,
)
from app.security import (
    generate_backup_codes,
    hash_backup_codes,
    hash_password,
    password_problem,
    verify_password,
)

router = APIRouter(prefix="/account", tags=["account"])

ISSUER = "HRMS"


def this_session(db: Session, admin: Admin) -> AdminSession | None:
    jti = audit.current().extra.get("jti")
    if not jti:
        return None
    return db.scalar(
        select(AdminSession).where(
            AdminSession.jti == jti, AdminSession.admin_id == admin.id
        )
    )


def account_out(db: Session, admin: Admin) -> AccountOut:
    live = db.scalar(
        select(AdminSession).where(
            AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)
        )
    )
    count = len(
        [
            s
            for s in db.scalars(
                select(AdminSession).where(
                    AdminSession.admin_id == admin.id,
                    AdminSession.revoked_at.is_(None),
                )
            )
        ]
    )
    return AccountOut(
        id=admin.id,
        email=admin.email,
        name=admin.name,
        is_active=admin.is_active,
        created_at=admin.created_at,
        password_changed_at=admin.password_changed_at,
        totp_enabled=admin.totp_enabled,
        totp_enabled_at=admin.totp_enabled_at,
        backup_codes_left=len(admin.backup_codes or []),
        active_sessions=count if live else 0,
    )


@router.get("", response_model=AccountOut)
def read_account(db: Session = Depends(get_db), admin: Admin = Depends(current_admin)):
    return account_out(db, admin)


@router.put("/profile", response_model=AccountOut)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    admin.name = payload.name
    db.commit()
    return account_out(db, admin)


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------


@router.put("/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Change it, then sign every other device out.

    A password change usually means the old one is suspect, so anything else
    holding a session with it stops working.
    """
    if not verify_password(payload.current_password, admin.password_hash):
        audit.record(
            db,
            action="action",
            entity="admin_auth",
            entity_id=admin.id,
            label=admin.email,
            summary="Password change refused — current password was wrong",
        )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "That is not your current password"
        )

    problem = password_problem(payload.new_password)
    if problem:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)

    if verify_password(payload.new_password, admin.password_hash):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "The new password has to be different",
        )

    admin.password_hash = hash_password(payload.new_password)
    admin.password_changed_at = datetime.now(timezone.utc)

    keep = this_session(db, admin)
    signed_out = 0
    for session in db.scalars(
        select(AdminSession).where(
            AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)
        )
    ):
        if keep is not None and session.id == keep.id:
            continue
        session.revoked_at = datetime.now(timezone.utc)
        session.revoked_reason = "password changed"
        signed_out += 1

    audit.record(
        db,
        action="action",
        entity="admin_auth",
        entity_id=admin.id,
        label=admin.email,
        summary=f"Password changed · {signed_out} other device(s) signed out",
        commit=False,
    )
    db.commit()


# ---------------------------------------------------------------------------
# Two-step sign-in
# ---------------------------------------------------------------------------


def qr_data_uri(uri: str) -> str:
    image = qrcode.make(uri)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode()
    return f"data:image/png;base64,{encoded}"


@router.post("/2fa/setup", response_model=MfaSetupOut)
def start_mfa(db: Session = Depends(get_db), admin: Admin = Depends(current_admin)):
    """Hand out a secret. Nothing changes until a code proves it was received."""
    if admin.totp_enabled:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Two-step sign-in is already on"
        )

    secret = pyotp.random_base32()
    admin.totp_pending_secret = secret
    db.commit()

    uri = pyotp.TOTP(secret).provisioning_uri(name=admin.email, issuer_name=ISSUER)
    return MfaSetupOut(secret=secret, otpauth_uri=uri, qr_png=qr_data_uri(uri))


@router.post("/2fa/enable", response_model=BackupCodesOut)
def enable_mfa(
    payload: MfaVerify,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    if admin.totp_enabled:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already on")
    if not admin.totp_pending_secret:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Start the setup again — nothing is pending"
        )

    code = payload.code.strip().replace(" ", "")
    if not pyotp.TOTP(admin.totp_pending_secret).verify(code, valid_window=1):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That code is not right")

    codes = generate_backup_codes()
    admin.totp_secret = admin.totp_pending_secret
    admin.totp_pending_secret = None
    admin.totp_enabled = True
    admin.totp_enabled_at = datetime.now(timezone.utc)
    admin.backup_codes = hash_backup_codes(codes)

    audit.record(
        db,
        action="action",
        entity="admin_auth",
        entity_id=admin.id,
        label=admin.email,
        summary="Two-step sign-in turned on",
        commit=False,
    )
    db.commit()

    # The only time these are ever readable.
    return BackupCodesOut(codes=codes)


@router.post("/2fa/backup-codes", response_model=BackupCodesOut)
def regenerate_backup_codes(
    payload: MfaDisable,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Replace the lot. The old ones stop working immediately."""
    if not admin.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Two-step sign-in is off")
    if not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong password")

    codes = generate_backup_codes()
    admin.backup_codes = hash_backup_codes(codes)
    audit.record(
        db,
        action="action",
        entity="admin_auth",
        entity_id=admin.id,
        label=admin.email,
        summary="Backup codes replaced",
        commit=False,
    )
    db.commit()
    return BackupCodesOut(codes=codes)


@router.post("/2fa/disable", response_model=AccountOut)
def disable_mfa(
    payload: MfaDisable,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    if not verify_password(payload.password, admin.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong password")

    admin.totp_enabled = False
    admin.totp_secret = None
    admin.totp_pending_secret = None
    admin.totp_enabled_at = None
    admin.backup_codes = []

    audit.record(
        db,
        action="action",
        entity="admin_auth",
        entity_id=admin.id,
        label=admin.email,
        summary="Two-step sign-in turned off",
        commit=False,
    )
    db.commit()
    return account_out(db, admin)


# ---------------------------------------------------------------------------
# Devices
# ---------------------------------------------------------------------------


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
    include_revoked: bool = False,
):
    stmt = select(AdminSession).where(AdminSession.admin_id == admin.id)
    if not include_revoked:
        stmt = stmt.where(AdminSession.revoked_at.is_(None))

    here = this_session(db, admin)
    rows = list(db.scalars(stmt.order_by(AdminSession.last_seen_at.desc())))

    return [
        SessionOut(
            id=row.id,
            device=row.device,
            ip_address=row.ip_address,
            user_agent=row.user_agent,
            created_at=row.created_at,
            last_seen_at=row.last_seen_at,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            revoked_reason=row.revoked_reason,
            is_current=here is not None and row.id == here.id,
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    session = db.scalar(
        select(AdminSession).where(
            AdminSession.id == session_id, AdminSession.admin_id == admin.id
        )
    )
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    if session.revoked_at is not None:
        return

    here = this_session(db, admin)
    if here is not None and session.id == here.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That is this device — use sign out instead",
        )

    session.revoked_at = datetime.now(timezone.utc)
    session.revoked_reason = "signed out by admin"
    audit.record(
        db,
        action="action",
        entity="admin_session",
        entity_id=session.id,
        label=session.device,
        summary=f"Signed out {session.device or 'a device'}",
        commit=False,
    )
    db.commit()


@router.post("/sessions/revoke-others", response_model=list[SessionOut])
def revoke_others(
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    """Sign out everywhere except the device asking."""
    here = this_session(db, admin)
    count = 0

    for session in db.scalars(
        select(AdminSession).where(
            AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)
        )
    ):
        if here is not None and session.id == here.id:
            continue
        session.revoked_at = datetime.now(timezone.utc)
        session.revoked_reason = "signed out by admin"
        count += 1

    audit.record(
        db,
        action="action",
        entity="admin_session",
        label=admin.email,
        summary=f"Signed out {count} other device(s)",
        commit=False,
    )
    db.commit()
    return list_sessions(db=db, admin=admin, include_revoked=False)


@router.get("/token-life", response_model=dict)
def token_life(_: Admin = Depends(current_admin)):
    return {"days": settings.JWT_EXPIRE_DAYS}

"""Admin accounts: inviting people and deciding what they may touch."""

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import audit, mailer
from app.db import get_db
from app.models import Admin, AdminSession
from app.permissions import MODULES, require_owner
from app.routers.auth import current_admin
from app.schemas import (
    ModuleOut,
    TeamMemberCreate,
    TeamMemberOut,
    TeamMemberUpdate,
)
from app.security import hash_password, password_problem

router = APIRouter(prefix="/team", tags=["team"])


def member_out(db: Session, admin: Admin, temporary: str | None = None) -> TeamMemberOut:
    last_seen = db.scalar(
        select(func.max(AdminSession.last_seen_at)).where(
            AdminSession.admin_id == admin.id, AdminSession.revoked_at.is_(None)
        )
    )
    return TeamMemberOut(
        id=admin.id,
        email=admin.email,
        name=admin.name,
        role=admin.role,
        permissions=admin.permissions or {},
        is_active=admin.is_active,
        invited_by=admin.invited_by,
        created_at=admin.created_at,
        password_changed_at=admin.password_changed_at,
        totp_enabled=admin.totp_enabled,
        last_seen_at=last_seen,
        temporary_password=temporary,
    )


@router.get("/modules", response_model=list[ModuleOut])
def modules(_: Admin = Depends(current_admin)):
    return [ModuleOut(key=key, label=label) for key, label in MODULES]


@router.get("", response_model=list[TeamMemberOut])
def list_team(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    rows = db.scalars(select(Admin).order_by(Admin.created_at)).all()
    return [member_out(db, row) for row in rows]


@router.post("", response_model=TeamMemberOut, status_code=status.HTTP_201_CREATED)
def invite(
    payload: TeamMemberCreate,
    db: Session = Depends(get_db),
    owner: Admin = Depends(require_owner),
):
    """Add a sub-admin. Without a password one is generated and shown once."""
    email = payload.email.lower()
    if db.scalar(select(Admin).where(Admin.email == email)):
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already in use")

    generated = None
    password = payload.password
    if not password:
        generated = password = secrets.token_urlsafe(9)
    else:
        problem = password_problem(password)
        if problem:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)

    member = Admin(
        email=email,
        name=payload.name,
        password_hash=hash_password(password),
        role="member",
        permissions={k: v for k, v in payload.permissions.items() if v != "none"},
        invited_by=owner.email,
        is_active=True,
        password_changed_at=datetime.now(timezone.utc),
    )
    db.add(member)
    db.flush()

    if mailer.config(db).send_portal_invites:
        mailer.queue(
            db,
            kind="admin_invite",
            to_email=email,
            to_name=payload.name,
            subject="You have been given access to the HR console",
            lines=[
                f"Hello {payload.name or ''},".strip(),
                f"{owner.email} has given you access to the HR console.",
                f"Email: <b>{email}</b>",
                f"Password: <b>{password}</b>",
                "Change it once you are in, under Account.",
            ],
            action=("Sign in", "/admin/login"),
            entity="admin_auth",
            entity_id=member.id,
        )

    audit.record(
        db,
        action="create",
        entity="admin_auth",
        entity_id=member.id,
        label=email,
        summary=f"Sub-admin added with {len(member.permissions)} permission(s)",
        commit=False,
    )
    db.commit()
    db.refresh(member)
    return member_out(db, member, generated)


@router.put("/{member_id}", response_model=TeamMemberOut)
def update(
    member_id: int,
    payload: TeamMemberUpdate,
    db: Session = Depends(get_db),
    owner: Admin = Depends(require_owner),
):
    member = db.get(Admin, member_id)
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    if member.role == "owner" and member.id != owner.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "An owner's access cannot be changed here"
        )

    generated = None

    if payload.name is not None:
        member.name = payload.name

    if payload.permissions is not None and member.role != "owner":
        member.permissions = {
            k: v for k, v in payload.permissions.items() if v != "none"
        }

    if payload.is_active is not None and member.role != "owner":
        member.is_active = payload.is_active
        if not payload.is_active:
            # Switching someone off has to end their sessions, or they keep
            # working until the token expires.
            for session in db.scalars(
                select(AdminSession).where(
                    AdminSession.admin_id == member.id,
                    AdminSession.revoked_at.is_(None),
                )
            ):
                session.revoked_at = datetime.now(timezone.utc)
                session.revoked_reason = "access withdrawn"

    if payload.password is not None:
        problem = password_problem(payload.password)
        if problem:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, problem)
        member.password_hash = hash_password(payload.password)
        member.password_changed_at = datetime.now(timezone.utc)
        generated = payload.password

    audit.record(
        db,
        action="update",
        entity="admin_auth",
        entity_id=member.id,
        label=member.email,
        summary="Sub-admin access changed",
        commit=False,
    )
    db.commit()
    db.refresh(member)
    return member_out(db, member, generated)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove(
    member_id: int,
    db: Session = Depends(get_db),
    owner: Admin = Depends(require_owner),
):
    member = db.get(Admin, member_id)
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Admin not found")
    if member.role == "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "An owner cannot be removed")
    if member.id == owner.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You cannot remove yourself")

    audit.record(
        db,
        action="delete",
        entity="admin_auth",
        entity_id=member.id,
        label=member.email,
        summary="Sub-admin removed",
        commit=False,
    )
    db.delete(member)
    db.commit()

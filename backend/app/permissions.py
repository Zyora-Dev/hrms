"""Who may do what.

A permission is a module and a level: nothing, read, or write. Read covers
the safe HTTP methods; write covers everything that changes something. The
check is attached to whole routers rather than individual endpoints, so a new
endpoint is covered the moment it is added rather than the day someone
remembers to annotate it.

An `owner` bypasses the table entirely — every system needs an account that
cannot be locked out of itself.
"""

from fastapi import Depends, HTTPException, Request, status

from app.models import Admin
from app.routers.auth import current_admin

# Shown in the UI in this order.
MODULES: list[tuple[str, str]] = [
    ("company", "Company profile"),
    ("employees", "Employees"),
    ("attendance", "Attendance & shifts"),
    ("leave", "Leave"),
    ("payroll", "Payroll, loans & claims"),
    ("reports", "Reports"),
    ("settings", "Settings & lookups"),
    ("audit", "Audit trail"),
    ("team", "Admin users"),
]

LEVELS = ("none", "read", "write")
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def level_for(admin: Admin, module: str) -> str:
    if admin.role == "owner":
        return "write"
    return (admin.permissions or {}).get(module, "none")


def allows(admin: Admin, module: str, needed: str) -> bool:
    have = level_for(admin, module)
    if needed == "read":
        return have in ("read", "write")
    return have == "write"


def permit(module: str):
    """Router-level guard: safe methods need read, the rest need write."""

    def guard(request: Request, admin: Admin = Depends(current_admin)) -> Admin:
        needed = "read" if request.method in SAFE_METHODS else "write"
        if not allows(admin, module, needed):
            label = dict(MODULES).get(module, module)
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"You do not have {needed} access to {label}",
            )
        return admin

    return guard


def require_owner(admin: Admin = Depends(current_admin)) -> Admin:
    if admin.role != "owner":
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Only an owner can do that"
        )
    return admin

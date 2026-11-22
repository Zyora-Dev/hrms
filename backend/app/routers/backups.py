"""Database backups: take one, list them, download one, delete one.

`pg_dump` in its custom format, which is what `pg_restore` wants and is far
smaller than plain SQL. Files live under `backups/` beside the uploads and
are never served statically — every download goes through this router, so it
is behind the same authentication as everything else and lands in the audit
trail.
"""

import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import audit
from app.config import settings
from app.db import get_db
from app.models import Admin
from app.permissions import require_owner
from app.schemas import BackupOut

router = APIRouter(prefix="/backups", tags=["backups"])

BACKUP_ROOT = settings.backup_dir
# A dump can take a while on a big database, but not forever.
TIMEOUT_SECONDS = 600
SAFE_NAME = re.compile(r"^hrms-\d{8}-\d{6}\.dump$")


def ensure_root() -> Path:
    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    return BACKUP_ROOT


def describe(path: Path) -> BackupOut:
    stat = path.stat()
    return BackupOut(
        name=path.name,
        size_bytes=stat.st_size,
        created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )


def connection_parts() -> tuple[list[str], dict[str, str]]:
    """`pg_dump` arguments and environment from the configured URL."""
    url = urlparse(settings.DATABASE_URL.replace("+psycopg", ""))
    if not url.path or url.path == "/":
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "The database URL has no database name in it",
        )

    args = ["--dbname", url.path.lstrip("/")]
    if url.hostname:
        args += ["--host", url.hostname]
    if url.port:
        args += ["--port", str(url.port)]
    if url.username:
        args += ["--username", url.username]

    env = dict(os.environ)
    if url.password:
        env["PGPASSWORD"] = url.password
    return args, env


@router.get("", response_model=list[BackupOut])
def list_backups(_: Admin = Depends(require_owner)):
    root = ensure_root()
    files = sorted(
        (p for p in root.glob("hrms-*.dump") if p.is_file()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return [describe(p) for p in files]


@router.post("", response_model=BackupOut, status_code=status.HTTP_201_CREATED)
def create_backup(
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    """Take a dump of the whole database, right now."""
    if shutil.which("pg_dump") is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "pg_dump is not installed on the server, so a backup cannot be taken",
        )

    root = ensure_root()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = root / f"hrms-{stamp}.dump"

    args, env = connection_parts()
    try:
        result = subprocess.run(
            ["pg_dump", "--format=custom", "--no-owner", "--file", str(target), *args],
            env=env,
            capture_output=True,
            timeout=TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        target.unlink(missing_ok=True)
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT, "The backup took too long and was stopped"
        ) from None

    if result.returncode != 0:
        target.unlink(missing_ok=True)
        detail = (result.stderr or b"").decode(errors="replace").strip()
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"pg_dump failed: {detail[:200] or 'no output'}",
        )

    audit.record(
        db,
        action="action",
        entity="backup",
        label=target.name,
        summary=f"Backup taken ({target.stat().st_size // 1024} KB)",
    )
    return describe(target)


def resolve(name: str) -> Path:
    """Accept only names this router itself produced."""
    if not SAFE_NAME.match(name):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a backup file")

    path = ensure_root() / name
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Backup not found")
    return path


@router.get("/{name}")
def download_backup(
    name: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    path = resolve(name)
    audit.record(
        db,
        action="action",
        entity="backup",
        label=name,
        summary="Backup downloaded",
    )
    return FileResponse(
        path, media_type="application/octet-stream", filename=name
    )


@router.delete("/{name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_backup(
    name: str,
    db: Session = Depends(get_db),
    admin: Admin = Depends(require_owner),
):
    path = resolve(name)
    path.unlink()
    audit.record(
        db,
        action="delete",
        entity="backup",
        label=name,
        summary="Backup deleted",
    )

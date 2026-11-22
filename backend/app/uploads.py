"""Shared file-upload helpers.

Client-supplied filenames are never trusted: every stored file gets a random
name with an extension derived from the declared (and allow-listed) MIME type.
"""

import secrets

from fastapi import HTTPException, UploadFile, status

from app.config import settings

UPLOAD_ROOT = settings.upload_dir

IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}

DOCUMENT_TYPES = {
    **IMAGE_TYPES,
    "application/pdf": ".pdf",
}

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2 MB
MAX_DOCUMENT_BYTES = 5 * 1024 * 1024  # 5 MB


def save_upload(
    file: UploadFile,
    *,
    folder: str,
    prefix: str,
    allowed: dict[str, str],
    max_bytes: int,
) -> str:
    """Persist `file` under uploads/<folder>/ and return its public path."""
    suffix = allowed.get(file.content_type or "")
    if not suffix:
        readable = ", ".join(sorted({v.lstrip(".").upper() for v in allowed.values()}))
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"File must be one of: {readable}",
        )

    contents = file.file.read(max_bytes + 1)
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty")
    if len(contents) > max_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File must be {max_bytes // (1024 * 1024)} MB or smaller",
        )

    directory = UPLOAD_ROOT / folder
    directory.mkdir(parents=True, exist_ok=True)

    filename = f"{prefix}-{secrets.token_hex(8)}{suffix}"
    (directory / filename).write_bytes(contents)
    return f"/uploads/{folder}/{filename}"


def delete_upload(public_path: str | None) -> None:
    """Remove a previously stored file. Missing files are ignored."""
    if not public_path:
        return
    relative = public_path.removeprefix("/uploads/")
    # Guard against traversal if a path was ever tampered with.
    target = (UPLOAD_ROOT / relative).resolve()
    if target.is_relative_to(UPLOAD_ROOT.resolve()):
        target.unlink(missing_ok=True)


def absolute_url(base_url: str, public_path: str | None) -> str | None:
    if not public_path:
        return None
    return base_url.rstrip("/") + public_path

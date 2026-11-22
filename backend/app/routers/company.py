import re
import secrets
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, Company
from app.routers.auth import current_admin
from app.schemas import CompanyCreate, CompanyOut, CompanyUpdate

router = APIRouter(prefix="/company", tags=["company"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "logos"
ALLOWED_LOGO_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "company"


def next_company_uid(db: Session) -> str:
    """CMP-0001, CMP-0002, … based on the current row count."""
    count = db.scalar(select(func.count()).select_from(Company)) or 0
    return f"CMP-{count + 1:04d}"


def unique_slug(db: Session, base: str, exclude_id: int | None = None) -> str:
    slug, n = base, 1
    while True:
        stmt = select(Company).where(Company.slug == slug)
        if exclude_id is not None:
            stmt = stmt.where(Company.id != exclude_id)
        if db.scalar(stmt) is None:
            return slug
        n += 1
        slug = f"{base}-{n}"


def with_logo_url(company: Company, request: Request) -> CompanyOut:
    out = CompanyOut.model_validate(company)
    if company.logo_path:
        out.logo_url = str(request.base_url).rstrip("/") + company.logo_path
    return out


def get_company_or_404(db: Session) -> Company:
    company = db.scalar(select(Company).order_by(Company.id).limit(1))
    if not company:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No company profile yet")
    return company


@router.get("", response_model=CompanyOut)
def read_company(
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    return with_logo_url(get_company_or_404(db), request)


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
def create_company(
    payload: CompanyCreate,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(Company).limit(1)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "A company profile already exists. Edit it instead.",
        )

    data = payload.model_dump()
    base = data.pop("slug") or slugify(payload.name)

    company = Company(
        **data,
        slug=unique_slug(db, base),
        company_uid=next_company_uid(db),
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return with_logo_url(company, request)


@router.put("", response_model=CompanyOut)
def update_company(
    payload: CompanyUpdate,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    company = get_company_or_404(db)

    data = payload.model_dump()
    base = data.pop("slug") or slugify(payload.name)

    for field, value in data.items():
        setattr(company, field, value)
    company.slug = unique_slug(db, base, exclude_id=company.id)

    db.commit()
    db.refresh(company)
    return with_logo_url(company, request)


@router.post("/logo", response_model=CompanyOut)
def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    company = get_company_or_404(db)

    suffix = ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if not suffix:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Logo must be a PNG, JPEG, WebP or SVG image",
        )

    contents = file.file.read(MAX_LOGO_BYTES + 1)
    if len(contents) > MAX_LOGO_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Logo must be 2 MB or smaller"
        )
    if not contents:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Random name — never trust the client-supplied filename.
    filename = f"{company.id}-{secrets.token_hex(8)}{suffix}"
    (UPLOAD_DIR / filename).write_bytes(contents)

    old = company.logo_path
    company.logo_path = f"/uploads/logos/{filename}"
    db.commit()
    db.refresh(company)

    if old:
        (UPLOAD_DIR.parent.parent / old.lstrip("/")).unlink(missing_ok=True)

    return with_logo_url(company, request)


@router.delete("/logo", response_model=CompanyOut)
def delete_logo(
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    company = get_company_or_404(db)
    if company.logo_path:
        (UPLOAD_DIR.parent.parent / company.logo_path.lstrip("/")).unlink(
            missing_ok=True
        )
        company.logo_path = None
        db.commit()
        db.refresh(company)
    return with_logo_url(company, request)

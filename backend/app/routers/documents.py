"""The document library: every employee's file, in one place.

The uploads themselves still belong to the employee endpoints — this is the
view across all of them, which is what somebody actually wants when they ask
"who has not given us their PAN card yet".
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Admin, Employee, EmployeeDocument
from app.routers.auth import current_admin
from app.schemas import LibraryDocument, LibraryFolder, LibraryPage
from app.uploads import absolute_url

router = APIRouter(prefix="/documents", tags=["documents"])

# What a complete file looks like. Anyone missing one of these is listed.
EXPECTED = ["id_proof", "address_proof", "pan_card", "degree_certificate"]


@router.get("", response_model=LibraryPage)
def library(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    q: str | None = None,
    department_id: int | None = None,
    doc_type: str | None = None,
    only_missing: bool = False,
):
    """One folder per employee, with what is in it."""
    people = select(Employee).where(Employee.status != "deleted")
    if department_id:
        people = people.where(Employee.department_id == department_id)
    if q:
        term = f"%{q.strip().lower()}%"
        people = people.where(
            or_(
                func.lower(Employee.first_name).like(term),
                func.lower(Employee.last_name).like(term),
                func.lower(Employee.employee_code).like(term),
            )
        )

    employees = list(db.scalars(people.order_by(Employee.employee_code)).unique())
    if not employees:
        return LibraryPage()

    documents: dict[int, list[EmployeeDocument]] = {}
    for doc in db.scalars(
        select(EmployeeDocument).where(
            EmployeeDocument.employee_id.in_([e.id for e in employees])
        )
    ):
        documents.setdefault(doc.employee_id, []).append(doc)

    folders = []
    total = 0
    missing_people: list[str] = []

    for employee in employees:
        owned = documents.get(employee.id, [])
        if doc_type:
            owned = [d for d in owned if d.doc_type == doc_type]

        kinds = sorted({d.doc_type for d in owned})
        lacking = [kind for kind in EXPECTED if kind not in kinds]
        if lacking:
            missing_people.append(employee.employee_code)

        if only_missing and not lacking:
            continue
        if doc_type and not owned:
            continue

        total += len(owned)
        folders.append(
            LibraryFolder(
                employee_id=employee.id,
                employee_code=employee.employee_code,
                employee_name=employee.full_name,
                department=(
                    employee.department_ref.name if employee.department_ref else None
                ),
                designation=(
                    employee.designation_ref.name
                    if employee.designation_ref
                    else None
                ),
                photo_path=employee.photo_path,
                documents=len(owned),
                kinds=kinds,
                latest_at=max((d.uploaded_at for d in owned), default=None),
            )
        )

    return LibraryPage(
        folders=folders,
        total_documents=total,
        total_employees=len(folders),
        missing=missing_people,
    )


@router.get("/recent", response_model=list[LibraryDocument])
def recent(
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    limit: int = Query(default=20, ge=1, le=100),
):
    """The latest uploads across everybody."""
    rows = db.scalars(
        select(EmployeeDocument)
        .order_by(EmployeeDocument.uploaded_at.desc())
        .limit(limit)
    ).unique()

    base = str(request.base_url)
    out = []
    for doc in rows:
        employee = doc.employee
        out.append(
            LibraryDocument(
                id=doc.id,
                employee_id=doc.employee_id,
                employee_code=employee.employee_code if employee else None,
                employee_name=employee.full_name if employee else None,
                department=(
                    employee.department_ref.name
                    if employee and employee.department_ref
                    else None
                ),
                doc_type=doc.doc_type,
                title=doc.title,
                original_name=doc.original_name,
                file_path=doc.file_path,
                file_url=absolute_url(base, doc.file_path),
                uploaded_at=doc.uploaded_at,
            )
        )
    return out


@router.get("/employee/{employee_id}", response_model=list[LibraryDocument])
def for_employee(
    employee_id: int,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    rows = db.scalars(
        select(EmployeeDocument)
        .where(EmployeeDocument.employee_id == employee_id)
        .order_by(EmployeeDocument.uploaded_at.desc())
    ).unique()

    base = str(request.base_url)
    return [
        LibraryDocument(
            id=doc.id,
            employee_id=doc.employee_id,
            employee_code=doc.employee.employee_code if doc.employee else None,
            employee_name=doc.employee.full_name if doc.employee else None,
            doc_type=doc.doc_type,
            title=doc.title,
            original_name=doc.original_name,
            file_path=doc.file_path,
            file_url=absolute_url(base, doc.file_path),
            uploaded_at=doc.uploaded_at,
        )
        for doc in rows
    ]

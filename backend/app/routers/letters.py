from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import letters as engine
from app.db import get_db
from app.models import Admin, Company, Employee, EmployeeDocument, LetterTemplate
from app.routers.auth import current_admin
from app.schemas import (
    EmployeeDocumentOut,
    LetterPreviewOut,
    LetterRenderRequest,
    LetterTemplateCreate,
    LetterTemplateListItem,
    LetterTemplateOut,
    LetterTemplateUpdate,
    MergeFieldOut,
)
from app.uploads import UPLOAD_ROOT, absolute_url

router = APIRouter(tags=["letters"])


def get_template_or_404(db: Session, template_id: int) -> LetterTemplate:
    template = db.get(LetterTemplate, template_id)
    if not template:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Letter template not found")
    return template


def get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return employee


def allowed_keys(template: LetterTemplate) -> set[str]:
    return set(engine.MERGE_FIELDS) | {i["name"] for i in (template.inputs or [])}


# --------------------------------------------------------------------------
# Template management
# --------------------------------------------------------------------------


@router.get("/letter-templates", response_model=list[LetterTemplateListItem])
def list_templates(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    include_inactive: bool = Query(default=False),
):
    stmt = select(LetterTemplate)
    if not include_inactive:
        stmt = stmt.where(LetterTemplate.is_active.is_(True))
    rows = db.scalars(stmt.order_by(LetterTemplate.category, LetterTemplate.name))
    return list(rows)


@router.get("/letter-templates/merge-fields", response_model=list[MergeFieldOut])
def list_merge_fields(_: Admin = Depends(current_admin)):
    return [
        MergeFieldOut(name=name, label=label)
        for name, label in engine.MERGE_FIELDS.items()
    ]


@router.get("/letter-templates/{template_id}", response_model=LetterTemplateOut)
def read_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    return get_template_or_404(db, template_id)


@router.post(
    "/letter-templates",
    response_model=LetterTemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def create_template(
    payload: LetterTemplateCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(LetterTemplate).where(LetterTemplate.key == payload.key)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A template with key “{payload.key}” exists"
        )

    data = payload.model_dump()
    data["inputs"] = [i for i in data["inputs"]]
    template = LetterTemplate(**data, is_builtin=False)
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/letter-templates/{template_id}", response_model=LetterTemplateOut)
def update_template(
    template_id: int,
    payload: LetterTemplateUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    template = get_template_or_404(db, template_id)

    for field, value in payload.model_dump().items():
        setattr(template, field, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/letter-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    template = get_template_or_404(db, template_id)
    if template.is_builtin:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Built-in templates can't be deleted. Deactivate it instead.",
        )
    db.delete(template)
    db.commit()


# --------------------------------------------------------------------------
# Generating a letter for an employee
# --------------------------------------------------------------------------


def _render(
    db: Session, employee: Employee, template: LetterTemplate, values: dict[str, str]
) -> tuple[str, dict, list[str]]:
    company = db.scalar(select(Company).order_by(Company.id).limit(1))
    context = engine.build_context(employee, company, values)

    missing = engine.missing_fields(template, context)
    for field in template.inputs or []:
        if field.get("required") and not (values.get(field["name"]) or "").strip():
            missing.append(field["label"])

    subject = engine.render(template.subject, context)
    body = engine.render(template.body, context)
    return engine.build_html(subject, body, context), context, missing


@router.post(
    "/employees/{employee_id}/letters/{template_id}/preview",
    response_model=LetterPreviewOut,
)
def preview_letter(
    employee_id: int,
    template_id: int,
    payload: LetterRenderRequest,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)
    template = get_template_or_404(db, template_id)

    document_html, context, missing = _render(db, employee, template, payload.values)

    return LetterPreviewOut(
        subject=engine.render(template.subject, context),
        html=document_html,
        missing_fields=missing,
        unknown_placeholders=engine.unknown_placeholders(
            template.body, allowed_keys(template)
        ),
    )


@router.post(
    "/employees/{employee_id}/letters/{template_id}/generate",
    response_model=EmployeeDocumentOut,
    status_code=status.HTTP_201_CREATED,
)
def generate_letter(
    employee_id: int,
    template_id: int,
    payload: LetterRenderRequest,
    request: Request,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    employee = get_employee_or_404(db, employee_id)
    template = get_template_or_404(db, template_id)

    document_html, context, missing = _render(db, employee, template, payload.values)
    if missing:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Fill these in before generating: " + ", ".join(missing),
        )

    pdf = engine.to_pdf(document_html)

    directory = UPLOAD_ROOT / "employees" / "letters"
    directory.mkdir(parents=True, exist_ok=True)

    seq = (
        db.scalar(
            select(func.count())
            .select_from(EmployeeDocument)
            .where(
                EmployeeDocument.employee_id == employee.id,
                EmployeeDocument.doc_type == "letter",
            )
        )
        or 0
    ) + 1

    filename = f"{employee.id}-{template.key}-{seq}.pdf"
    (directory / filename).write_bytes(pdf)

    subject = engine.render(template.subject, context)
    document = EmployeeDocument(
        employee_id=employee.id,
        doc_type="letter",
        title=f"{template.name} — {context['today']}",
        file_path=f"/uploads/employees/letters/{filename}",
        original_name=f"{subject}.pdf",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    out = EmployeeDocumentOut.model_validate(document)
    out.file_url = absolute_url(str(request.base_url), document.file_path)
    return out

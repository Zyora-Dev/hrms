"""Letter rendering: build the merge context, fill templates, make PDFs."""

import html
import re
from datetime import date
from decimal import Decimal
from io import BytesIO

from xhtml2pdf import pisa

from app.models import Company, Employee

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-z0-9_]+)\s*\}\}", re.IGNORECASE)

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

# Labels shown in the editor's placeholder list.
MERGE_FIELDS: dict[str, str] = {
    "employee_name": "Full name",
    "first_name": "First name",
    "last_name": "Last name",
    "salutation": "Mr./Ms. + last name",
    "employee_code": "Employee code",
    "designation": "Designation",
    "department": "Department",
    "work_email": "Work email",
    "phone": "Mobile",
    "work_location": "Work location",
    "employment_type": "Employment type",
    "date_of_joining": "Date of joining",
    "probation_end_date": "Probation end date",
    "date_of_exit": "Date of exit",
    "ctc_annual": "Annual CTC",
    "ctc_monthly": "Monthly CTC",
    "pan": "PAN",
    "uan": "UAN",
    "bank_name": "Bank name",
    "bank_account_number": "Bank account number",
    "current_address": "Current address",
    "tenure": "Tenure (joining – exit/today)",
    "company_name": "Company name",
    "company_address": "Company address",
    "company_email": "Company email",
    "company_phone": "Company phone",
    "company_cin": "Company CIN",
    "company_gstin": "Company GSTIN",
    "today": "Today's date",
}


def format_date(value: date | None) -> str:
    if not value:
        return ""
    return f"{value.day:02d} {MONTHS[value.month - 1]} {value.year}"


def format_money(value: Decimal | None) -> str:
    """Indian grouping: 24,00,000 rather than 2,400,000.

    Uses "Rs." rather than ₹ — the PDF renderer falls back to the base-14
    Helvetica font, which has no rupee glyph, so ₹ prints as a black box.
    "Rs." is portable across any host without shipping a font file.
    """
    if value is None:
        return ""
    whole = int(value)
    s = str(abs(whole))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"Rs. {'-' if whole < 0 else ''}{s}"


def tenure_text(start: date | None, end: date | None) -> str:
    if not start:
        return ""
    end = end or date.today()
    months = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        months -= 1
    months = max(months, 0)
    years, rem = divmod(months, 12)

    parts = []
    if years:
        parts.append(f"{years} year{'s' if years != 1 else ''}")
    if rem:
        parts.append(f"{rem} month{'s' if rem != 1 else ''}")
    return " ".join(parts) or "less than a month"


def build_context(
    employee: Employee,
    company: Company | None,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    title = {"male": "Mr.", "female": "Ms."}.get(employee.gender or "", "")
    ctc = employee.ctc_annual

    context = {
        "employee_name": employee.full_name,
        "first_name": employee.first_name,
        "last_name": employee.last_name,
        "salutation": f"{title} {employee.last_name}".strip(),
        "employee_code": employee.employee_code,
        "designation": employee.designation or "",
        "department": employee.department or "",
        "work_email": employee.work_email,
        "phone": employee.phone or "",
        "work_location": employee.work_location or "",
        "employment_type": (employee.employment_type or "").replace("_", " ").title(),
        "date_of_joining": format_date(employee.date_of_joining),
        "probation_end_date": format_date(employee.probation_end_date),
        "date_of_exit": format_date(employee.date_of_exit),
        "ctc_annual": format_money(ctc),
        "ctc_monthly": format_money(ctc / 12 if ctc is not None else None),
        "pan": employee.pan or "",
        "uan": employee.uan or "",
        "bank_name": employee.bank_name or "",
        "bank_account_number": employee.bank_account_number or "",
        "current_address": employee.current_address or "",
        "tenure": tenure_text(employee.date_of_joining, employee.date_of_exit),
        "company_name": company.name if company else "",
        "company_address": company.address if company and company.address else "",
        "company_email": company.email if company and company.email else "",
        "company_phone": company.phone if company and company.phone else "",
        "company_cin": company.cin if company and company.cin else "",
        "company_gstin": company.gstin if company and company.gstin else "",
        "today": format_date(date.today()),
    }
    context.update({k: (v or "") for k, v in (extra or {}).items()})
    return context


def missing_fields(template, context: dict[str, str]) -> list[str]:
    """Required merge fields that resolve to blank."""
    return [f for f in (template.required_fields or []) if not context.get(f)]


def render(text: str, context: dict[str, str]) -> str:
    """Replace {{placeholders}}. Values are escaped — templates are authored by
    admins, but employee data is not, so it must never inject markup."""

    def sub(match: re.Match) -> str:
        key = match.group(1).lower()
        if key not in context:
            return match.group(0)
        return html.escape(str(context[key])).replace("\n", "<br/>")

    return PLACEHOLDER_RE.sub(sub, text)


def unknown_placeholders(text: str, allowed: set[str]) -> list[str]:
    found = {m.group(1).lower() for m in PLACEHOLDER_RE.finditer(text)}
    return sorted(found - allowed)


PAGE_CSS = """
@page { size: A4; margin: 2.2cm 2cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.55; }
.letterhead { border-bottom: 1.5pt solid #072869; padding-bottom: 8pt; margin-bottom: 18pt; }
.company { font-size: 14pt; font-weight: bold; color: #072869; }
.company-meta { font-size: 8.5pt; color: #555; margin-top: 2pt; }
.meta { font-size: 9pt; color: #555; margin-bottom: 14pt; }
h1 { font-size: 12.5pt; text-transform: uppercase; letter-spacing: 0.4pt;
     margin: 0 0 14pt 0; padding-bottom: 4pt; border-bottom: 0.5pt solid #ccc; }
p { margin: 0 0 9pt 0; text-align: justify; }
table { width: 100%; border-collapse: collapse; margin: 10pt 0; }
td, th { border: 0.5pt solid #ccc; padding: 5pt 7pt; font-size: 9.5pt; text-align: left; }
th { background: #eef2fb; }
.sign { margin-top: 28pt; }
.footer { position: fixed; bottom: 0.8cm; left: 0; right: 0;
          font-size: 7.5pt; color: #888; text-align: center; }
"""


def build_html(subject: str, body_html: str, context: dict[str, str]) -> str:
    company = context.get("company_name") or ""
    meta_bits = [
        context.get("company_address", ""),
        context.get("company_email", ""),
        context.get("company_phone", ""),
    ]
    meta = " · ".join(b.replace("\n", ", ") for b in meta_bits if b)

    return f"""<html><head><meta charset="utf-8"><style>{PAGE_CSS}</style></head><body>
<div class="letterhead">
  <div class="company">{html.escape(company)}</div>
  <div class="company-meta">{html.escape(meta)}</div>
</div>
<div class="meta">
  Ref: {html.escape(context.get("employee_code", ""))}<br/>
  Date: {html.escape(context.get("today", ""))}
</div>
<h1>{html.escape(subject)}</h1>
{body_html}
<div class="footer">{html.escape(company)} — this is a computer-generated letter.</div>
</body></html>"""


def to_pdf(document_html: str, link_callback=None) -> bytes:
    buffer = BytesIO()
    result = pisa.CreatePDF(
        document_html, dest=buffer, encoding="utf-8", link_callback=link_callback
    )
    if result.err:
        raise RuntimeError("Could not render the letter to PDF")
    return buffer.getvalue()

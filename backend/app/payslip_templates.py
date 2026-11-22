"""Payslip rendering.

A layout is a *base* skeleton plus a set of options. The base decides the
overall shape; the options decide what appears in it. The same function
renders both the on-screen preview and the PDF, so what the editor shows is
what gets printed.

Amounts use "Rs." rather than ₹ because the PDF renderer falls back to the
base-14 Helvetica font, which has no rupee glyph.
"""

import html
from datetime import date
from decimal import Decimal
from pathlib import Path

from app.letters import MONTHS, format_money
from app.numbers import in_words
from app.uploads import UPLOAD_ROOT

BASES = {
    "classic": "Classic — bordered two-column grid",
    "modern": "Modern — banded header with cards",
    "compact": "Compact — single column",
}

# Every switch the editor exposes, with its default.
DEFAULT_OPTIONS: dict = {
    "accent_color": "#072869",
    "title": "Payslip",
    "show_logo": True,
    # "company" reuses the Company profile logo; "custom" uses logo_path.
    "logo_source": "company",
    "logo_path": None,
    "logo_height": 34,
    "logo_align": "left",
    "show_company_address": True,
    "show_employee_meta": True,
    "show_attendance_stats": True,
    "show_notes": True,
    "show_leave_table": True,
    "show_employer_contributions": True,
    "show_net_in_words": True,
    "show_signature": False,
    "signature_label": "Authorised Signatory",
    "footer_note": "This is a computer-generated payslip and does not require a signature.",
    "density": "comfortable",
}


def merged(options: dict | None) -> dict:
    return {**DEFAULT_OPTIONS, **(options or {})}


def esc(value) -> str:
    return html.escape("" if value is None else str(value))


def rupees(value) -> str:
    return format_money(Decimal(str(value or 0)))


def period_label(period: date) -> str:
    return f"{MONTHS[period.month - 1]} {period.year}"


def hours(minutes) -> str:
    minutes = int(minutes or 0)
    if not minutes:
        return "0h"
    h, m = divmod(minutes, 60)
    return f"{h}h {m}m" if m else f"{h}h"


def resolve_upload(public_path: str | None) -> str | None:
    """Absolute filesystem path — xhtml2pdf reads images from disk."""
    if not public_path:
        return None
    relative = public_path.removeprefix("/uploads/")
    path = (UPLOAD_ROOT / relative).resolve()
    if not path.is_relative_to(UPLOAD_ROOT.resolve()):
        return None
    return str(path) if path.is_file() else None


def logo_public_path(company, opt: dict) -> str | None:
    """The design's own logo when set, otherwise the company profile's."""
    if opt.get("logo_source") == "custom":
        return opt.get("logo_path")
    return company.logo_path if company else None


def logo_src(company, opt: dict, asset_base: str | None = None) -> str | None:
    """Where the image lives, for whoever is rendering.

    The PDF engine reads from disk, but a browser preview needs an HTTP URL —
    emitting the filesystem path to both means the preview silently shows
    nothing.
    """
    public = logo_public_path(company, opt)
    if not public:
        return None

    if asset_base:
        if resolve_upload(public) is None:
            return None
        return asset_base.rstrip("/") + public

    return resolve_upload(public)


def company_block(company) -> tuple[str, str]:
    if not company:
        return "", ""
    meta = " · ".join(
        part.replace("\n", ", ")
        for part in (company.address, company.email, company.phone)
        if part
    )
    return esc(company.name), esc(meta)


# --------------------------------------------------------------------------
# A payslip as plain data, so previews work without a database row.
# --------------------------------------------------------------------------


def slip_data(slip) -> dict:
    employee = getattr(slip, "employee", None)
    return {
        "name": employee.full_name if employee else "",
        "code": employee.employee_code if employee else "",
        "designation": (employee.designation or "") if employee else "",
        "department": (employee.department or "") if employee else "",
        "bank": (employee.bank_account_number or "") if employee else "",
        "pan": (employee.pan or "") if employee else "",
        "payable_days": slip.payable_days,
        "period_days": slip.period_days,
        "lop_days": slip.lop_days,
        "worked_minutes": slip.worked_minutes,
        "overtime_minutes": slip.overtime_minutes,
        "earnings": list(slip.earnings or []),
        "deductions": list(slip.deductions or []),
        "employer_contributions": list(slip.employer_contributions or []),
        "leave": [],
        "gross_pay": slip.gross_pay,
        "total_deductions": slip.total_deductions,
        "net_pay": slip.net_pay,
    }


SAMPLE: dict = {
    "name": "Aarav Mehta",
    "code": "EMP-0001",
    "designation": "Senior Engineer",
    "department": "Engineering",
    "bank": "50100123456789",
    "pan": "ABCDE1234F",
    "payable_days": "26.00",
    "period_days": "26.00",
    "lop_days": "0.00",
    "worked_minutes": 12480,
    "overtime_minutes": 600,
    "earnings": [
        {"code": "BASIC", "name": "Basic", "amount": "25000.00", "note": None},
        {"code": "HRA", "name": "House Rent Allowance", "amount": "10000.00", "note": None},
        {"code": "CONV", "name": "Conveyance", "amount": "1600.00", "note": None},
        {"code": "SPECIAL", "name": "Special Allowance", "amount": "13400.00", "note": None},
        {"code": "OT", "name": "Overtime", "amount": "1802.89", "note": "600 min @ 1.5x"},
        {"code": "LEAVE_ENC", "name": "Leave encashment", "amount": "1442.31",
         "note": "1.5 day(s) converted to salary"},
    ],
    "deductions": [
        {"code": "PF", "name": "Provident Fund", "amount": "1800.00", "note": None},
        {"code": "PT", "name": "Professional Tax", "amount": "200.00", "note": None},
    ],
    "employer_contributions": [
        {"code": "PF_ER", "name": "PF (employer)", "amount": "1800.00", "note": None},
    ],
    "leave": [
        {"code": "EL", "name": "Earned Leave", "opening": "0.00", "accrued": "1.50",
         "used": "0.00", "encashed": "1.50", "lapsed": "0.00", "closing": "0.00"},
        {"code": "CL", "name": "Casual Leave", "opening": "0.00", "accrued": "1.00",
         "used": "1.00", "encashed": "0.00", "lapsed": "0.00", "closing": "0.00"},
    ],
    "gross_pay": "53245.20",
    "total_deductions": "2000.00",
    "net_pay": "51245.00",
}


# --------------------------------------------------------------------------
# Shared partials
# --------------------------------------------------------------------------


def pad(opt: dict, comfortable: str, compact: str) -> str:
    return compact if opt["density"] == "compact" else comfortable


def logo_tag(company, opt: dict, asset_base: str | None = None) -> str:
    if not opt["show_logo"]:
        return ""
    src = logo_src(company, opt, asset_base)
    if not src:
        return ""
    align = opt.get("logo_align") or "left"
    return (
        f'<div style="text-align:{esc(align)}">'
        f'<img src="{esc(src)}" alt="" style="height:{int(opt["logo_height"])}pt" />'
        "</div>"
    )


def meta_table(data: dict, opt: dict) -> str:
    if not opt["show_employee_meta"]:
        return ""
    rows = [
        ("Employee", data["name"]),
        ("Employee code", data["code"]),
        ("Designation", data["designation"] or "—"),
        ("Department", data["department"] or "—"),
    ]
    if data.get("pan"):
        rows.append(("PAN", data["pan"]))
    if data.get("bank"):
        rows.append(("Bank account", data["bank"]))

    return "<table>" + "".join(
        f"<tr><td style='padding:1.5pt 0;color:#6b7280;font-size:8pt'>{esc(k)}</td>"
        f"<td style='padding:1.5pt 0;font-weight:bold;font-size:8pt'>{esc(v)}</td></tr>"
        for k, v in rows
    ) + "</table>"


def stats_row(data: dict, opt: dict) -> str:
    if not opt["show_attendance_stats"]:
        return ""
    cells = [
        ("Payable days", f"{data['payable_days']}/{data['period_days']}"),
        ("Loss of pay", str(data["lop_days"])),
        ("Hours worked", hours(data["worked_minutes"])),
        ("Overtime", hours(data["overtime_minutes"])),
    ]
    return (
        "<table style='margin-top:8pt'><tr>"
        + "".join(
            "<td style='padding:4pt 6pt;border:0.5pt solid #e2e6ee'>"
            f"<div style='font-size:7pt;color:#6b7280'>{esc(k)}</div>"
            f"<div style='font-weight:bold;font-size:8.5pt'>{esc(v)}</div></td>"
            for k, v in cells
        )
        + "</tr></table>"
    )


def leave_table(data: dict, opt: dict) -> str:
    rows = data.get("leave") or []
    if not opt["show_leave_table"] or not rows:
        return ""

    head = "".join(
        f"<th style='padding:3pt 5pt;border:0.4pt solid #e2e6ee;background:#f6f8fc;"
        f"font-size:7pt;text-align:{'left' if i == 0 else 'right'}'>{h}</th>"
        for i, h in enumerate(
            ["Leave", "Opening", "Accrued", "Used", "Encashed", "Lapsed", "Carried"]
        )
    )
    body = "".join(
        "<tr>"
        + f"<td style='padding:2.5pt 5pt;border:0.4pt solid #e2e6ee;font-size:7.5pt'>{esc(r['name'])}</td>"
        + "".join(
            f"<td style='padding:2.5pt 5pt;border:0.4pt solid #e2e6ee;font-size:7.5pt;text-align:right'>{esc(r[k])}</td>"
            for k in ("opening", "accrued", "used", "encashed", "lapsed", "closing")
        )
        + "</tr>"
        for r in rows
    )
    return (
        "<div style='margin-top:9pt;font-size:7.5pt;font-weight:bold;"
        "text-transform:uppercase;letter-spacing:0.5pt;color:#6b7280'>Leave this period</div>"
        f"<table style='margin-top:3pt'><tr>{head}</tr>{body}</table>"
    )


def contributions_block(data: dict, opt: dict) -> str:
    rows = data.get("employer_contributions") or []
    if not opt["show_employer_contributions"] or not rows:
        return ""
    items = "".join(
        f"<tr><td style='padding:1.5pt 0;color:#6b7280;font-size:7.5pt'>{esc(r['name'])}</td>"
        f"<td style='padding:1.5pt 0;text-align:right;font-size:7.5pt'>{rupees(r['amount'])}</td></tr>"
        for r in rows
    )
    return (
        "<div style='margin-top:9pt;border:0.5pt dashed #cbd3e1;padding:6pt 8pt'>"
        "<div style='font-size:7pt;font-weight:bold;text-transform:uppercase;"
        "letter-spacing:0.5pt;color:#6b7280'>Employer contributions (not deducted)</div>"
        f"<table style='margin-top:3pt'>{items}</table></div>"
    )


def net_block(data: dict, opt: dict) -> str:
    words = (
        f"<div style='font-size:7.5pt;color:#6b7280;padding:3pt 9pt 0'>"
        f"{esc(in_words(data['net_pay']))}</div>"
        if opt["show_net_in_words"]
        else ""
    )
    accent = esc(opt["accent_color"])
    return f"""<table style="margin-top:10pt;border:1pt solid {accent}">
  <tr>
    <td style="padding:{pad(opt, '7pt 9pt', '5pt 9pt')};font-weight:bold">NET PAY</td>
    <td style="padding:{pad(opt, '7pt 9pt', '5pt 9pt')};font-size:14pt;font-weight:bold;text-align:right">
      {rupees(data['net_pay'])}
    </td>
  </tr>
</table>{words}"""


def signature_block(opt: dict) -> str:
    if not opt["show_signature"]:
        return ""
    return (
        "<table style='margin-top:22pt'><tr><td></td>"
        "<td style='text-align:right;font-size:8pt'>"
        "<div style='border-top:0.5pt solid #9aa3af;width:150pt;margin-left:auto'></div>"
        f"<div style='padding-top:3pt'>{esc(opt['signature_label'])}</div>"
        "</td></tr></table>"
    )


def footer(name: str, opt: dict) -> str:
    note = opt.get("footer_note") or ""
    inline = (
        f"<p style='margin-top:9pt;font-size:7.5pt;color:#6b7280'>{esc(note)}</p>"
        if note
        else ""
    )
    return inline + (
        "<div style='position:fixed;bottom:0.7cm;left:0;right:0;text-align:center;"
        f"font-size:7pt;color:#9aa3af'>{name}</div>"
    )


BASE_CSS = """
@page { size: A4; margin: 1.6cm 1.5cm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #14181f; }
table { width: 100%; border-collapse: collapse; }
td, th { vertical-align: top; }
"""


# --------------------------------------------------------------------------
# Bases
# --------------------------------------------------------------------------


def render_classic(data, company, period, opt, asset_base=None) -> str:
    name, meta = company_block(company)
    accent = esc(opt["accent_color"])
    cell = f"padding:{pad(opt, '3pt 6pt', '2pt 5pt')};border:0.4pt solid #d8dde5"

    earnings, deductions = data["earnings"], data["deductions"]
    body = ""
    for i in range(max(len(earnings), len(deductions))):
        e = earnings[i] if i < len(earnings) else None
        d = deductions[i] if i < len(deductions) else None
        body += (
            "<tr>"
            f"<td style='{cell}'>{esc(e['name']) if e else ''}</td>"
            f"<td style='{cell};text-align:right'>{rupees(e['amount']) if e else ''}</td>"
            f"<td style='{cell}'>{esc(d['name']) if d else ''}</td>"
            f"<td style='{cell};text-align:right'>{rupees(d['amount']) if d else ''}</td>"
            "</tr>"
        )

    group = (
        f"padding:4pt 6pt;border:0.4pt solid #d8dde5;background:#eef2fb;"
        f"font-size:8pt;text-transform:uppercase;letter-spacing:0.4pt;text-align:left"
    )
    total = f"{cell};background:#f6f8fc;font-weight:bold"
    logo = logo_tag(company, opt, asset_base)

    return f"""<html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head><body>
<table style="border-bottom:1.5pt solid {accent};padding-bottom:6pt">
  <tr>
    {f'<td style="width:15%;padding-right:8pt">{logo}</td>' if logo else ''}
    <td>
      <div style="font-size:13pt;font-weight:bold;color:{accent}">{name}</div>
      {f'<div style="font-size:7.5pt;color:#6b7280">{meta}</div>' if opt["show_company_address"] else ''}
    </td>
    <td style="text-align:right">
      <div style="font-size:7.5pt;color:#6b7280">{esc(opt['title'])}</div>
      <div style="font-size:11pt;font-weight:bold">{esc(period_label(period))}</div>
    </td>
  </tr>
</table>

<div style="margin-top:10pt">{meta_table(data, opt)}</div>
{stats_row(data, opt)}

<table style="margin-top:10pt">
  <tr><th style="{group}" colspan="2">Earnings</th><th style="{group}" colspan="2">Deductions</th></tr>
  {body}
  <tr>
    <td style="{total}">Gross</td>
    <td style="{total};text-align:right">{rupees(data['gross_pay'])}</td>
    <td style="{total}">Total deductions</td>
    <td style="{total};text-align:right">{rupees(data['total_deductions'])}</td>
  </tr>
</table>

{net_block(data, opt)}
{leave_table(data, opt)}
{contributions_block(data, opt)}
{signature_block(opt)}
{footer(name, opt)}
</body></html>"""


def render_modern(data, company, period, opt, asset_base=None) -> str:
    name, meta = company_block(company)
    accent = esc(opt["accent_color"])
    logo = logo_tag(company, opt, asset_base)

    def card(title, rows, total_label, total) -> str:
        items = "".join(
            "<tr>"
            f"<td style='padding:2.5pt 0'>{esc(r['name'])}"
            + (
                f"<div style='font-size:7pt;color:#6b7280'>{esc(r['note'])}</div>"
                if opt["show_notes"] and r.get("note")
                else ""
            )
            + "</td>"
            f"<td style='padding:2.5pt 0;text-align:right'>{rupees(r['amount'])}</td></tr>"
            for r in rows
        ) or "<tr><td style='color:#6b7280;font-size:8pt'>None</td></tr>"

        return f"""<div style="border:0.5pt solid #e2e6ee;padding:8pt 10pt">
  <div style="font-size:7.5pt;font-weight:bold;color:{accent};text-transform:uppercase;letter-spacing:0.6pt">{esc(title)}</div>
  <table style="margin-top:4pt">{items}</table>
  <table style="margin-top:5pt;border-top:0.5pt solid #e2e6ee">
    <tr><td style="padding-top:4pt;font-weight:bold">{esc(total_label)}</td>
        <td style="padding-top:4pt;text-align:right;font-weight:bold">{rupees(total)}</td></tr>
  </table>
</div>"""

    return f"""<html><head><meta charset="utf-8"><style>{BASE_CSS}</style></head><body>
<table style="background:{accent};color:#ffffff">
  <tr>
    {f'<td style="width:15%;padding:10pt 0 10pt 12pt">{logo}</td>' if logo else ''}
    <td style="padding:12pt 14pt">
      <div style="font-size:13pt;font-weight:bold">{name}</div>
      {f'<div style="font-size:7.5pt;color:#c7d2e8">{meta}</div>' if opt["show_company_address"] else ''}
    </td>
    <td style="padding:12pt 14pt;text-align:right">
      <div style="font-size:7.5pt;color:#c7d2e8">{esc(opt['title']).upper()}</div>
      <div style="font-size:11pt;font-weight:bold">{esc(period_label(period))}</div>
    </td>
  </tr>
</table>

<table style="margin-top:12pt">
  <tr>
    <td>
      <div style="font-size:12pt;font-weight:bold">{esc(data['name'])}</div>
      <div style="font-size:8pt;color:#6b7280">
        {esc(data['code'])}{esc(' · ' + data['designation'] if data['designation'] else '')}
        {esc(' · ' + data['department'] if data['department'] else '')}
      </div>
    </td>
    <td style="text-align:right">
      <div style="font-size:8pt;color:#6b7280">Net pay</div>
      <div style="font-size:16pt;font-weight:bold;color:{accent}">{rupees(data['net_pay'])}</div>
      {f"<div style='font-size:7pt;color:#6b7280'>{esc(in_words(data['net_pay']))}</div>" if opt["show_net_in_words"] else ''}
    </td>
  </tr>
</table>

{stats_row(data, opt)}

<table style="margin-top:10pt">
  <tr>
    <td style="width:49%;padding-right:5pt">{card('Earnings', data['earnings'], 'Gross pay', data['gross_pay'])}</td>
    <td style="width:49%;padding-left:5pt">{card('Deductions', data['deductions'], 'Total deductions', data['total_deductions'])}</td>
  </tr>
</table>

{leave_table(data, opt)}
{contributions_block(data, opt)}
{signature_block(opt)}
{footer(name, opt)}
</body></html>"""


def render_compact(data, company, period, opt, asset_base=None) -> str:
    name, _meta = company_block(company)
    accent = esc(opt["accent_color"])
    logo = logo_tag(company, opt, asset_base)

    def rows(items, sign) -> str:
        return "".join(
            f"<tr><td style='padding:2pt 0'>{esc(r['name'])}</td>"
            f"<td style='padding:2pt 0;text-align:right'>{sign}{rupees(r['amount'])}</td></tr>"
            for r in items
        )

    return f"""<html><head><meta charset="utf-8"><style>{BASE_CSS}
body {{ font-size: 9pt; }}
</style></head><body>
<table style="border-bottom:1pt solid {accent};padding-bottom:4pt">
  <tr>
    {f'<td style="width:15%;padding-right:7pt">{logo}</td>' if logo else ''}
    <td style="font-size:11pt;font-weight:bold;color:{accent}">{name}</td>
    <td style="text-align:right;font-size:8pt;color:#6b7280">
      {esc(opt['title'])} · {esc(period_label(period))}
    </td>
  </tr>
</table>

<table style="margin-top:8pt">
  <tr>
    <td style="font-weight:bold">{esc(data['name'])}</td>
    <td style="text-align:right;font-size:8pt;color:#6b7280">{esc(data['code'])}</td>
  </tr>
  <tr><td colspan="2" style="font-size:8pt;color:#6b7280">
    {esc(data['designation'] or '—')} · Payable {data['payable_days']}/{data['period_days']} days ·
    LOP {data['lop_days']} · OT {hours(data['overtime_minutes'])}
  </td></tr>
</table>

<table style="margin-top:8pt">
  <tr><td colspan="2" style="font-size:7.5pt;font-weight:bold;border-bottom:0.5pt solid #d8dde5;padding-bottom:2pt">EARNINGS</td></tr>
  {rows(data['earnings'], '')}
  <tr><td style="padding-top:3pt;font-weight:bold">Gross</td>
      <td style="padding-top:3pt;text-align:right;font-weight:bold">{rupees(data['gross_pay'])}</td></tr>

  <tr><td colspan="2" style="font-size:7.5pt;font-weight:bold;border-bottom:0.5pt solid #d8dde5;padding:8pt 0 2pt">DEDUCTIONS</td></tr>
  {rows(data['deductions'], '-')}
  <tr><td style="padding-top:3pt;font-weight:bold">Total deductions</td>
      <td style="padding-top:3pt;text-align:right;font-weight:bold">-{rupees(data['total_deductions'])}</td></tr>

  <tr>
    <td style="border-top:1pt solid {accent};padding-top:5pt;font-size:11pt;font-weight:bold">NET PAY</td>
    <td style="border-top:1pt solid {accent};padding-top:5pt;font-size:11pt;font-weight:bold;text-align:right">
      {rupees(data['net_pay'])}</td>
  </tr>
</table>
{f"<div style='font-size:7.5pt;color:#6b7280;margin-top:3pt'>{esc(in_words(data['net_pay']))}</div>" if opt["show_net_in_words"] else ''}

{leave_table(data, opt)}
{contributions_block(data, opt)}
{signature_block(opt)}
{footer(name, opt)}
</body></html>"""


RENDERERS = {
    "classic": render_classic,
    "modern": render_modern,
    "compact": render_compact,
}


def render(
    base: str,
    data: dict,
    company,
    period: date,
    options: dict | None = None,
    asset_base: str | None = None,
) -> str:
    """`asset_base` set => images are HTTP URLs (browser preview).
    Left as None => images are filesystem paths (PDF)."""
    return RENDERERS.get(base, render_classic)(
        data, company, period, merged(options), asset_base
    )


def link_callback(uri: str, _rel: str) -> str:
    """Resolve image paths for the PDF renderer, confined to the upload root."""
    path = Path(uri)
    if path.is_absolute() and path.resolve().is_relative_to(UPLOAD_ROOT.resolve()):
        return str(path)
    return uri

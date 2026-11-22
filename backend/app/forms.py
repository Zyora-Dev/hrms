"""Form 130 — the annual statement of salary paid and tax deducted.

Form 130 replaces Form 16 under the Income-tax Act 2025 and keeps the same
two halves:

  * Part A — what was deducted and when, quarter by quarter, reconciled
    against the challans that were actually deposited.
  * Part B — how the year's taxable salary and tax were arrived at.

Everything here is read back from the payslips that were issued, not
recomputed, so the certificate says what was actually paid. The tax engine is
asked only for the parts a payslip never held — the slab working.
"""

from datetime import date
from decimal import Decimal

ZERO = Decimal("0")

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]

QUARTERS = [
    ("Q1", "April – June"),
    ("Q2", "July – September"),
    ("Q3", "October – December"),
    ("Q4", "January – March"),
]


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def rupees(value) -> str:
    """Indian grouping, the way a certificate prints it."""
    amount = money(value)
    negative = amount < 0
    whole, _, paise = f"{abs(amount):.2f}".partition(".")

    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail

    return f"{'-' if negative else ''}Rs. {whole}.{paise}"


def fy_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def quarter_of(period: date, fy_start: int) -> int:
    """Which quarter of the financial year a month falls in."""
    months_in = (period.year - fy_start) * 12 + (period.month - 4)
    return months_in // 3


class Form130:
    """Everything the certificate prints, gathered in one place."""

    def __init__(self, employee, company, year: int):
        self.employee = employee
        self.company = company
        self.year = year

        self.months: list[dict] = []
        self.quarters: list[dict] = [
            {"code": code, "span": span, "paid": ZERO, "deducted": ZERO,
             "deposited": ZERO, "challans": []}
            for code, span in QUARTERS
        ]

        self.gross = ZERO
        self.deducted = ZERO
        self.exemptions: list[tuple[str, Decimal]] = []
        self.deductions: list[tuple[str, Decimal]] = []
        self.computation: dict = {}

    def add_payslip(self, period: date, gross: Decimal, tds: Decimal) -> None:
        self.months.append(
            {"label": f"{MONTHS[period.month - 1]} {period.year}",
             "gross": money(gross), "tds": money(tds)}
        )
        self.gross += money(gross)
        self.deducted += money(tds)

        index = quarter_of(period, self.year)
        if 0 <= index < 4:
            self.quarters[index]["paid"] += money(gross)
            self.quarters[index]["deducted"] += money(tds)

    def add_challan(self, period: date, challan) -> None:
        index = quarter_of(period, self.year)
        if not 0 <= index < 4:
            return
        self.quarters[index]["deposited"] += money(challan.total_amount)
        # The CIN is built from the parts, the way the TDS screen shows it:
        # BSR code, date of deposit, then the challan serial.
        cin = (
            f"{challan.bsr_code}{challan.deposit_date:%d%m%Y}"
            f"{challan.challan_serial}"
        )
        self.quarters[index]["challans"].append(
            {
                "cin": cin,
                "bsr": challan.bsr_code,
                "serial": challan.challan_serial,
                "deposited_on": challan.deposit_date,
                "amount": money(challan.total_amount),
            }
        )

    @property
    def deposited(self) -> Decimal:
        return sum((q["deposited"] for q in self.quarters), ZERO)


STYLE = """
@page { size: a4; margin: 14mm 12mm; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #111; }
h1 { font-size: 13pt; margin: 0 0 2px 0; }
h2 { font-size: 9.5pt; margin: 14px 0 5px 0; padding-bottom: 3px;
     border-bottom: 1.5px solid #072869; color: #072869; }
.sub { font-size: 7.5pt; color: #444; margin: 0; }
table { width: 100%; border-collapse: collapse; margin-top: 4px; }
th, td { border: 0.5px solid #c8c8c8; padding: 4px 5px; text-align: left;
         vertical-align: top; }
th { background: #eef2fa; font-size: 7.5pt; text-transform: uppercase;
     letter-spacing: 0.3px; }
td.num, th.num { text-align: right; }
tr.total td { background: #f4f6fb; font-weight: bold; }
.head { border-bottom: 2px solid #072869; padding-bottom: 8px; margin-bottom: 4px; }
.parties td { border: 0; padding: 2px 0; }
.parties .label { color: #555; width: 32%; font-size: 7.5pt; }
.note { font-size: 7pt; color: #555; margin-top: 10px; line-height: 1.4; }
.sign { margin-top: 26px; }
"""


def render(form: Form130) -> str:
    employee = form.employee
    company = form.company

    def party_rows(pairs):
        return "".join(
            f"<tr><td class='label'>{label}</td><td><b>{value or '—'}</b></td></tr>"
            for label, value in pairs
        )

    month_rows = "".join(
        f"<tr><td>{m['label']}</td>"
        f"<td class='num'>{rupees(m['gross'])}</td>"
        f"<td class='num'>{rupees(m['tds'])}</td></tr>"
        for m in form.months
    ) or "<tr><td colspan='3'>No salary was paid in this year.</td></tr>"

    quarter_rows = "".join(
        f"<tr><td>{q['code']}</td><td>{q['span']}</td>"
        f"<td class='num'>{rupees(q['paid'])}</td>"
        f"<td class='num'>{rupees(q['deducted'])}</td>"
        f"<td class='num'>{rupees(q['deposited'])}</td>"
        f"<td>{'<br>'.join(c['cin'] for c in q['challans']) or '—'}</td></tr>"
        for q in form.quarters
    )

    def line_rows(lines):
        return "".join(
            f"<tr><td>{label}</td><td class='num'>{rupees(amount)}</td></tr>"
            for label, amount in lines
        ) or "<tr><td colspan='2'>None claimed.</td></tr>"

    c = form.computation

    return f"""<html><head><meta charset="utf-8"><style>{STYLE}</style></head><body>
<div class="head">
  <h1>Form 130</h1>
  <p class="sub">Certificate of tax deducted at source from salary ·
     Financial year {fy_label(form.year)} ·
     Assessment year {fy_label(form.year + 1)}</p>
</div>

<table class="parties"><tr>
  <td width="50%"><table class="parties">{party_rows([
      ("Deductor", company.name if company else "—"),
      ("Address", company.address if company else "—"),
      ("TAN", getattr(company, "tan", None) if company else "—"),
      ("PAN", company.pan if company else "—"),
  ])}</table></td>
  <td width="50%"><table class="parties">{party_rows([
      ("Employee", employee.full_name),
      ("Employee ID", employee.employee_code),
      ("PAN", employee.pan),
      ("Designation", employee.designation_ref.name
       if employee.designation_ref else None),
  ])}</table></td>
</tr></table>

<h2>Part A — tax deducted and deposited</h2>
<table>
  <tr><th>Quarter</th><th>Period</th><th class="num">Salary paid</th>
      <th class="num">Tax deducted</th><th class="num">Tax deposited</th>
      <th>Challan identification</th></tr>
  {quarter_rows}
  <tr class="total"><td colspan="2">Total</td>
      <td class="num">{rupees(form.gross)}</td>
      <td class="num">{rupees(form.deducted)}</td>
      <td class="num">{rupees(form.deposited)}</td><td></td></tr>
</table>

<h2>Month by month</h2>
<table>
  <tr><th>Month</th><th class="num">Salary paid</th><th class="num">Tax deducted</th></tr>
  {month_rows}
  <tr class="total"><td>Total</td>
      <td class="num">{rupees(form.gross)}</td>
      <td class="num">{rupees(form.deducted)}</td></tr>
</table>

<h2>Part B — how the tax was worked out</h2>
<table>
  <tr><th>Particulars</th><th class="num">Amount</th></tr>
  <tr><td>Gross salary paid</td><td class="num">{rupees(form.gross)}</td></tr>
  <tr><td colspan="2"><b>Less: exemptions</b></td></tr>
  {line_rows(form.exemptions)}
  <tr><td colspan="2"><b>Less: deductions</b></td></tr>
  {line_rows(form.deductions)}
  <tr class="total"><td>Taxable income</td>
      <td class="num">{rupees(c.get('taxable_income'))}</td></tr>
  <tr><td>Tax on taxable income</td>
      <td class="num">{rupees(c.get('slab_tax'))}</td></tr>
  <tr><td>Less: rebate</td><td class="num">{rupees(c.get('rebate'))}</td></tr>
  <tr><td>Add: surcharge</td><td class="num">{rupees(c.get('surcharge'))}</td></tr>
  <tr><td>Add: health and education cess</td>
      <td class="num">{rupees(c.get('cess'))}</td></tr>
  <tr class="total"><td>Total tax payable</td>
      <td class="num">{rupees(c.get('annual_tax'))}</td></tr>
  <tr><td>Less: tax deducted at source</td>
      <td class="num">{rupees(form.deducted)}</td></tr>
  <tr class="total"><td>Balance
      {'payable' if money(c.get('annual_tax')) > form.deducted else 'refundable'}</td>
      <td class="num">{rupees(abs(money(c.get('annual_tax')) - form.deducted))}</td></tr>
</table>

<p class="note">
  Computed under the <b>{c.get('regime_name', 'applicable')}</b>.
  Salary and tax figures are taken from the payslips issued for this year;
  challan details are those recorded against the monthly deposits.
  This certificate is generated from payroll records and is valid without a
  signature unless countersigned below.
</p>

<div class="sign">
  <table class="parties"><tr>
    <td width="60%"></td>
    <td width="40%">
      <p class="sub">For {company.name if company else 'the employer'}</p>
      <div style="height:36px"></div>
      <p class="sub">Authorised signatory</p>
    </td>
  </tr></table>
</div>
</body></html>"""


# ---------------------------------------------------------------------------
# Form 138 — the quarterly return
# ---------------------------------------------------------------------------


class Form138:
    """One quarter's return: what every employee was paid and what was taken.

    Form 138 replaced 24Q. The statement has two halves as well: the challans
    deposited for the quarter, and the deductee rows those challans cover.
    The two totals have to agree, and the form says so when they do not.
    """

    def __init__(self, company, year: int, quarter: int, start: date, end: date):
        self.company = company
        self.year = year
        self.quarter = quarter
        self.start = start
        self.end = end

        self.challans: list[dict] = []
        self.rows: list[dict] = []

    def add_challan(self, challan) -> None:
        self.challans.append(
            {
                "cin": f"{challan.bsr_code}{challan.deposit_date:%d%m%Y}"
                f"{challan.challan_serial}",
                "bsr": challan.bsr_code,
                "serial": challan.challan_serial,
                "deposited_on": challan.deposit_date,
                "tds": money(challan.tds_amount),
                "surcharge": money(challan.surcharge),
                "cess": money(challan.education_cess),
                "interest": money(challan.interest),
                "fee": money(challan.late_fee),
                "total": money(challan.total_amount),
            }
        )

    def add_row(self, employee, paid: Decimal, deducted: Decimal, months: int) -> None:
        self.rows.append(
            {
                "code": employee.employee_code,
                "name": employee.full_name,
                "pan": employee.pan or "PANNOTAVBL",
                "paid": money(paid),
                "deducted": money(deducted),
                "months": months,
            }
        )

    @property
    def paid(self) -> Decimal:
        return sum((r["paid"] for r in self.rows), ZERO)

    @property
    def deducted(self) -> Decimal:
        return sum((r["deducted"] for r in self.rows), ZERO)

    @property
    def deposited(self) -> Decimal:
        return sum((c["total"] for c in self.challans), ZERO)

    @property
    def difference(self) -> Decimal:
        return money(self.deducted - self.deposited)


def render_138(form: Form138) -> str:
    company = form.company
    gap = form.difference

    challan_rows = "".join(
        f"<tr><td>{c['cin']}</td><td>{c['deposited_on']}</td>"
        f"<td class='num'>{rupees(c['tds'])}</td>"
        f"<td class='num'>{rupees(c['interest'])}</td>"
        f"<td class='num'>{rupees(c['fee'])}</td>"
        f"<td class='num'>{rupees(c['total'])}</td></tr>"
        for c in form.challans
    ) or "<tr><td colspan='6'>No challan was recorded for this quarter.</td></tr>"

    deductee_rows = "".join(
        f"<tr><td>{i}</td><td>{r['code']}</td><td>{r['name']}</td>"
        f"<td>{r['pan']}</td><td class='num'>{r['months']}</td>"
        f"<td class='num'>{rupees(r['paid'])}</td>"
        f"<td class='num'>{rupees(r['deducted'])}</td></tr>"
        for i, r in enumerate(form.rows, start=1)
    ) or "<tr><td colspan='7'>Nobody was paid in this quarter.</td></tr>"

    if gap == ZERO:
        verdict = (
            "<p class='ok'>Tax deducted matches tax deposited for the quarter.</p>"
        )
    elif gap > ZERO:
        verdict = (
            f"<p class='warn'>{rupees(gap)} was deducted but has not been "
            "deposited. Record the missing challan before filing.</p>"
        )
    else:
        verdict = (
            f"<p class='warn'>{rupees(abs(gap))} more was deposited than "
            "deducted this quarter — check whether a challan belongs to "
            "another period.</p>"
        )

    return f"""<html><head><meta charset="utf-8"><style>{STYLE}
.ok {{ color: #166534; font-weight: bold; font-size: 8pt; margin-top: 6px; }}
.warn {{ color: #9a3412; font-weight: bold; font-size: 8pt; margin-top: 6px; }}
</style></head><body>
<div class="head">
  <h1>Form 138</h1>
  <p class="sub">Quarterly statement of tax deducted at source from salary ·
     Q{form.quarter} of {fy_label(form.year)} ·
     {form.start:%d %b %Y} to {form.end:%d %b %Y}</p>
</div>

<table class="parties"><tr>
  <td width="50%"><table class="parties">
    <tr><td class='label'>Deductor</td><td><b>{company.name if company else '—'}</b></td></tr>
    <tr><td class='label'>TAN</td><td><b>{(getattr(company, 'tan', None) if company else None) or '—'}</b></td></tr>
    <tr><td class='label'>PAN</td><td><b>{(company.pan if company else None) or '—'}</b></td></tr>
  </table></td>
  <td width="50%"><table class="parties">
    <tr><td class='label'>Employees paid</td><td><b>{len(form.rows)}</b></td></tr>
    <tr><td class='label'>Salary paid</td><td><b>{rupees(form.paid)}</b></td></tr>
    <tr><td class='label'>Tax deducted</td><td><b>{rupees(form.deducted)}</b></td></tr>
  </table></td>
</tr></table>

<h2>Challans deposited</h2>
<table>
  <tr><th>Challan identification</th><th>Deposited on</th>
      <th class="num">TDS</th><th class="num">Interest</th>
      <th class="num">Late fee</th><th class="num">Total</th></tr>
  {challan_rows}
  <tr class="total"><td colspan="5">Total deposited</td>
      <td class="num">{rupees(form.deposited)}</td></tr>
</table>
{verdict}

<h2>Deductees</h2>
<table>
  <tr><th>#</th><th>Employee ID</th><th>Name</th><th>PAN</th>
      <th class="num">Months</th><th class="num">Salary paid</th>
      <th class="num">Tax deducted</th></tr>
  {deductee_rows}
  <tr class="total"><td colspan="5">Total</td>
      <td class="num">{rupees(form.paid)}</td>
      <td class="num">{rupees(form.deducted)}</td></tr>
</table>

<p class="note">
  Figures are taken from the payslips issued for the quarter and the challans
  recorded against them. A row showing <b>PANNOTAVBL</b> has no PAN on file —
  tax on those employees is deductible at the higher rate, and the return
  will be rejected until the PAN is supplied.
</p>
</body></html>"""

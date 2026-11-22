"""Payslip calculation.

Attendance decides how much of the month is payable; the salary structure
decides how the monthly gross is split into lines; settings decide every
rate, ceiling and rounding rule. Nothing here is a hardcoded number — the
defaults all live in the PayrollSettings row so they can be changed without
touching this file.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.models import LeaveType, PayrollSettings, SalaryComponent

ZERO = Decimal("0")
CENTS = Decimal("0.01")


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(value).quantize(CENTS, rounding=ROUND_HALF_UP)


def percent_of(amount: Decimal, pct: Decimal) -> Decimal:
    return money(amount * pct / Decimal(100))


def days_in_month(period: date) -> int:
    if period.month == 12:
        return 31
    nxt = period.replace(month=period.month + 1, day=1)
    return (nxt - period.replace(day=1)).days


@dataclass
class AttendanceInput:
    """What the attendance module contributes to a payslip."""

    present_days: Decimal = ZERO
    half_days: Decimal = ZERO
    absent_days: Decimal = ZERO
    weekly_offs: Decimal = ZERO
    paid_leave_days: Decimal = ZERO
    worked_minutes: int = 0
    overtime_minutes: int = 0
    shift_minutes_expected: int = 0


@dataclass
class ExtraLine:
    """A one-off payroll input: bonus, incentive, deduction, extra overtime."""

    kind: str
    label: str
    amount: Decimal = ZERO
    hours: Decimal | None = None
    include_in_pf: bool = False
    include_in_esi: bool = True


# Which side of the payslip each kind lands on.
DEDUCTION_KINDS = {"deduction", "advance", "loan_emi", "salary_advance"}


@dataclass
class LeaveOutcome:
    leave_type_id: int
    code: str
    name: str
    opening: Decimal
    accrued: Decimal
    used: Decimal
    encashed: Decimal
    lapsed: Decimal
    closing: Decimal
    encashment_amount: Decimal


@dataclass
class Line:
    code: str
    name: str
    amount: Decimal
    note: str | None = None

    def as_dict(self) -> dict:
        return {
            "code": self.code,
            "name": self.name,
            "amount": str(self.amount),
            "note": self.note,
        }


@dataclass
class PayslipResult:
    monthly_gross: Decimal
    period_days: Decimal
    payable_days: Decimal
    lop_days: Decimal
    worked_minutes: int
    overtime_minutes: int
    earnings: list[Line] = field(default_factory=list)
    deductions: list[Line] = field(default_factory=list)
    employer_contributions: list[Line] = field(default_factory=list)
    leave: list[LeaveOutcome] = field(default_factory=list)
    gross_pay: Decimal = ZERO
    total_deductions: Decimal = ZERO
    net_pay: Decimal = ZERO


def period_basis_days(
    settings: PayrollSettings, period: date, attendance: AttendanceInput
) -> Decimal:
    """Denominator for a day's pay — configurable, not assumed."""
    if settings.lop_basis == "calendar_days":
        return Decimal(days_in_month(period))
    if settings.lop_basis == "working_days":
        worked = (
            attendance.present_days
            + attendance.half_days
            + attendance.absent_days
            + attendance.paid_leave_days
        )
        return worked if worked > ZERO else Decimal(settings.standard_days_per_month)
    # "standard_days" and the hours basis both fall back to the configured
    # standard month; hours are handled separately below.
    return Decimal(settings.standard_days_per_month)


def payable_days_for(
    settings: PayrollSettings, period: date, attendance: AttendanceInput
) -> tuple[Decimal, Decimal, Decimal]:
    """Returns (period_days, payable_days, lop_days)."""
    basis = period_basis_days(settings, period, attendance)

    if settings.lop_basis == "shift_hours":
        # Pay follows hours actually worked against the shift, so an overnight
        # or continued shift counts in full rather than as "one day".
        expected = Decimal(attendance.shift_minutes_expected or 0)
        if expected > ZERO:
            ratio = Decimal(attendance.worked_minutes) / expected
            payable = (basis * ratio).quantize(CENTS, rounding=ROUND_HALF_UP)
            payable = min(payable, basis)
            return basis, payable, max(basis - payable, ZERO)

    credited = (
        attendance.present_days
        + (attendance.half_days / Decimal(2))
        + attendance.paid_leave_days
        + attendance.weekly_offs
    )
    payable = min(credited, basis)
    return basis, payable, max(basis - payable, ZERO)


def build_leave_outcomes(
    leave_types: list[LeaveType],
    balances: dict[int, dict],
    per_day_rate: Decimal,
    settings: PayrollSettings,
) -> list[LeaveOutcome]:
    """Apply each leave type's own policy to its leftover balance.

    A type with carry_forward off and encash_unused on turns the remainder
    into money; with both off it simply lapses.
    """
    outcomes: list[LeaveOutcome] = []

    for leave_type in leave_types:
        if not leave_type.is_active:
            continue

        existing = balances.get(leave_type.id, {})
        opening = Decimal(existing.get("opening", 0))
        used = Decimal(existing.get("used", 0))
        accrued = Decimal(leave_type.monthly_accrual)

        available = opening + accrued
        if leave_type.annual_cap is not None:
            available = min(available, Decimal(leave_type.annual_cap))

        leftover = max(available - used, ZERO)

        encashed = lapsed = closing = ZERO
        amount = ZERO

        if leave_type.carry_forward:
            closing = leftover
            if leave_type.carry_forward_cap is not None:
                capped = min(closing, Decimal(leave_type.carry_forward_cap))
                lapsed = closing - capped
                closing = capped
        elif leave_type.encash_unused and settings.leave_encashment_enabled:
            encashed = leftover
            amount = money(
                per_day_rate * encashed * Decimal(leave_type.encashment_percent) / 100
            )
        else:
            lapsed = leftover

        outcomes.append(
            LeaveOutcome(
                leave_type_id=leave_type.id,
                code=leave_type.code,
                name=leave_type.name,
                opening=opening,
                accrued=accrued,
                used=used,
                encashed=encashed,
                lapsed=lapsed,
                closing=closing,
                encashment_amount=amount,
            )
        )

    return outcomes


def compute_payslip(
    *,
    period: date,
    monthly_gross: Decimal,
    attendance: AttendanceInput,
    components: list[SalaryComponent],
    leave_types: list[LeaveType],
    leave_balances: dict[int, dict],
    settings: PayrollSettings,
    extras: list[ExtraLine] | None = None,
) -> PayslipResult:
    monthly_gross = money(monthly_gross or ZERO)

    period_days, payable_days, lop_days = payable_days_for(
        settings, period, attendance
    )
    ratio = (payable_days / period_days) if period_days > ZERO else ZERO

    result = PayslipResult(
        monthly_gross=monthly_gross,
        period_days=period_days,
        payable_days=payable_days,
        lop_days=lop_days,
        worked_minutes=attendance.worked_minutes,
        overtime_minutes=attendance.overtime_minutes,
    )

    # No salary on file means no structure to split and nothing to deduct —
    # otherwise a fixed component would pay someone who has no CTC set.
    if monthly_gross <= ZERO:
        return result

    # ---- Earnings from the configured structure -------------------------
    earning_specs = sorted(
        (c for c in components if c.kind == "earning" and c.is_active),
        key=lambda c: (c.sort_order, c.id),
    )

    full_amounts: dict[str, Decimal] = {}
    basic_full = ZERO

    # First pass: percent-of-gross and fixed lines, at full month value.
    for spec in earning_specs:
        if spec.calculation == "percent_of_gross":
            amount = percent_of(monthly_gross, Decimal(spec.value))
        elif spec.calculation == "fixed":
            amount = money(spec.value)
        else:
            amount = ZERO
        full_amounts[spec.code] = amount
        if spec.code.upper() == "BASIC":
            basic_full = amount

    # Second pass: lines derived from basic, then the balancing line.
    for spec in earning_specs:
        if spec.calculation == "percent_of_basic":
            full_amounts[spec.code] = percent_of(basic_full, Decimal(spec.value))

    allocated = sum(
        (v for k, v in full_amounts.items()), ZERO
    ) - sum(
        (full_amounts[s.code] for s in earning_specs if s.calculation == "balance"),
        ZERO,
    )
    for spec in earning_specs:
        if spec.calculation == "balance":
            full_amounts[spec.code] = max(monthly_gross - allocated, ZERO)

    pf_wage = ZERO
    esi_wage = ZERO
    basic_paid = ZERO

    for spec in earning_specs:
        full = full_amounts.get(spec.code, ZERO)
        paid = money(full * ratio) if spec.prorate_on_lop else full
        if paid == ZERO and full == ZERO:
            continue

        note = None
        if spec.prorate_on_lop and lop_days > ZERO:
            note = f"{payable_days} of {period_days} days"

        result.earnings.append(Line(spec.code, spec.name, paid, note))

        if spec.include_in_pf:
            pf_wage += paid
        if spec.include_in_esi:
            esi_wage += paid
        if spec.code.upper() == "BASIC":
            basic_paid = paid

    # ---- Overtime --------------------------------------------------------
    ot_base_monthly = (
        basic_full if settings.overtime_rate_basis == "basic" else monthly_gross
    )
    per_day_rate = (
        money(ot_base_monthly / period_days) if period_days > ZERO else ZERO
    )
    per_minute = (
        (per_day_rate / Decimal(8 * 60)) if per_day_rate > ZERO else ZERO
    )

    extras = extras or []

    # Overtime entered by hand is added to what attendance measured.
    manual_ot_minutes = sum(
        int(Decimal(e.hours or 0) * 60) for e in extras if e.kind == "overtime" and e.hours
    )
    total_ot_minutes = attendance.overtime_minutes + manual_ot_minutes

    if settings.pay_overtime and total_ot_minutes > 0:
        amount = money(
            per_minute * Decimal(total_ot_minutes) * Decimal(settings.overtime_multiplier)
        )
        if amount > ZERO:
            note = f"{total_ot_minutes} min @ {settings.overtime_multiplier}x"
            if manual_ot_minutes:
                note += f" (incl. {manual_ot_minutes} min added manually)"
            result.earnings.append(Line("OT", "Overtime", amount, note))
            esi_wage += amount
            result.overtime_minutes = total_ot_minutes

    # ---- Leave: carry forward, encash or lapse ---------------------------
    encash_base = (
        basic_full if settings.encashment_basis == "basic" else monthly_gross
    )
    encash_per_day = (
        money(encash_base / period_days) if period_days > ZERO else ZERO
    )

    result.leave = build_leave_outcomes(
        leave_types, leave_balances, encash_per_day, settings
    )

    encashment_total = sum((o.encashment_amount for o in result.leave), ZERO)
    if encashment_total > ZERO:
        days = sum((o.encashed for o in result.leave), ZERO)
        result.earnings.append(
            Line(
                "LEAVE_ENC",
                "Leave encashment",
                money(encashment_total),
                f"{days} day(s) converted to salary",
            )
        )

    # One-off earnings: bonus, incentive, reimbursement, arrears.
    for extra in extras:
        if extra.kind in DEDUCTION_KINDS or extra.kind == "overtime":
            continue
        amount = money(extra.amount)
        if amount <= ZERO:
            continue
        result.earnings.append(Line(extra.kind.upper(), extra.label, amount))
        if extra.include_in_pf:
            pf_wage += amount
        if extra.include_in_esi:
            esi_wage += amount

    # Overtime priced from hours rather than money is already in the OT line;
    # an overtime input given as a flat amount is added here.
    for extra in extras:
        if extra.kind == "overtime" and not extra.hours and money(extra.amount) > ZERO:
            amount = money(extra.amount)
            result.earnings.append(Line("OT_EXTRA", extra.label, amount))
            if extra.include_in_esi:
                esi_wage += amount

    result.gross_pay = money(sum((line.amount for line in result.earnings), ZERO))

    # ---- Statutory deductions -------------------------------------------
    if settings.pf_enabled:
        base = pf_wage if pf_wage > ZERO else basic_paid
        if settings.pf_cap_at_ceiling:
            base = min(base, money(settings.pf_wage_ceiling))
        employee_pf = percent_of(base, Decimal(settings.pf_employee_percent))
        if employee_pf > ZERO:
            result.deductions.append(
                Line("PF", "Provident Fund", employee_pf, f"on {base}")
            )
            result.employer_contributions.append(
                Line(
                    "PF_ER",
                    "PF (employer)",
                    percent_of(base, Decimal(settings.pf_employer_percent)),
                )
            )

    if settings.esi_enabled and esi_wage <= money(settings.esi_gross_ceiling):
        employee_esi = percent_of(esi_wage, Decimal(settings.esi_employee_percent))
        if employee_esi > ZERO:
            result.deductions.append(Line("ESI", "ESI", employee_esi))
            result.employer_contributions.append(
                Line(
                    "ESI_ER",
                    "ESI (employer)",
                    percent_of(esi_wage, Decimal(settings.esi_employer_percent)),
                )
            )

    if settings.pt_enabled and money(settings.pt_amount) > ZERO:
        result.deductions.append(
            Line("PT", "Professional Tax", money(settings.pt_amount))
        )

    # ---- Configured deduction components ---------------------------------
    for spec in sorted(
        (c for c in components if c.kind == "deduction" and c.is_active),
        key=lambda c: (c.sort_order, c.id),
    ):
        if spec.calculation == "percent_of_gross":
            amount = percent_of(result.gross_pay, Decimal(spec.value))
        elif spec.calculation == "percent_of_basic":
            amount = percent_of(basic_paid, Decimal(spec.value))
        else:
            amount = money(spec.value)
        if amount > ZERO:
            result.deductions.append(Line(spec.code, spec.name, amount))

    for extra in extras:
        if extra.kind not in DEDUCTION_KINDS:
            continue
        amount = money(extra.amount)
        if amount > ZERO:
            # TDS keeps its own code so challan reconciliation can find it.
            code = "TDS" if extra.label.upper().startswith("INCOME TAX") else extra.kind.upper()
            result.deductions.append(Line(code, extra.label, amount))

    result.total_deductions = money(
        sum((line.amount for line in result.deductions), ZERO)
    )
    net = result.gross_pay - result.total_deductions

    step = int(settings.round_net_to or 0)
    if step > 0:
        net = (net / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step

    result.net_pay = money(max(net, ZERO))
    return result

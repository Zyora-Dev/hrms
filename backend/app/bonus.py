"""Statutory bonus under the Payment of Bonus Act.

Every threshold is a setting, because the ceilings are revised periodically
and vary by state minimum wage.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
CENTS = Decimal("0.01")

BASIS_CODES = {
    "basic": ("BASIC",),
    "basic_da": ("BASIC", "DA"),
    "gross": (),  # empty means use the whole gross
}


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass
class BonusResult:
    employee_id: int
    employee_name: str
    employee_code: str
    months: int
    days_worked: Decimal
    wage_total: Decimal
    capped_wage_total: Decimal
    rate: Decimal
    amount: Decimal
    eligible: bool
    reason: str | None = None


def monthly_wage(slip, basis: str) -> Decimal:
    """The wage a bonus is reckoned on for one month."""
    codes = BASIS_CODES.get(basis, ("BASIC",))
    if not codes:
        return Decimal(str(slip.gross_pay or 0))

    total = ZERO
    for line in slip.earnings or []:
        if str(line.get("code", "")).upper() in codes:
            total += Decimal(str(line.get("amount", "0")))
    return total


def compute(slips, employee, settings, rate: Decimal | None = None) -> BonusResult:
    """Accrue the bonus across an accounting year's payslips."""
    basis = settings.bonus_basis
    ceiling = Decimal(settings.bonus_calculation_ceiling)
    minimum_wage = Decimal(settings.bonus_minimum_wage or 0)
    # The Act reckons on the higher of the notified ceiling or the minimum wage.
    cap = max(ceiling, minimum_wage)

    eligibility = Decimal(settings.bonus_eligibility_ceiling)
    chosen = Decimal(str(rate if rate is not None else settings.bonus_rate_percent))
    chosen = max(
        Decimal(settings.bonus_min_percent),
        min(chosen, Decimal(settings.bonus_max_percent)),
    )

    wage_total = ZERO
    capped_total = ZERO
    days = ZERO
    months = 0
    over_ceiling = 0

    for slip in slips:
        wage = monthly_wage(slip, basis)
        if wage <= ZERO:
            continue
        months += 1
        days += Decimal(str(slip.payable_days or 0))
        wage_total += wage
        capped_total += min(wage, cap)

        if wage > eligibility:
            over_ceiling += 1

    result = BonusResult(
        employee_id=employee.id,
        employee_name=employee.full_name,
        employee_code=employee.employee_code,
        months=months,
        days_worked=days,
        wage_total=money(wage_total),
        capped_wage_total=money(capped_total),
        rate=chosen,
        amount=ZERO,
        eligible=True,
    )

    if months == 0:
        result.eligible = False
        result.reason = "No payroll in this year"
        return result

    if days < Decimal(settings.bonus_min_days):
        result.eligible = False
        result.reason = (
            f"Worked {days} day(s); {settings.bonus_min_days} required"
        )
        return result

    # Covered only if the wage stayed within the eligibility ceiling.
    if over_ceiling == months:
        result.eligible = False
        result.reason = f"Wage above the {eligibility} ceiling"
        return result

    result.amount = money(capped_total * chosen / Decimal(100))
    return result

"""Income tax on salary.

Every rate, ceiling and band is read from the database rather than written
here, because the Finance Act revises them and they differ by regime. This
module only knows the *shape* of the calculation:

    gross
      − exemptions (HRA)                      [old regime only]
      − standard deduction
      − Chapter VI-A deductions (80C, 80D …)  [old regime only]
      = taxable income
      → slab tax → rebate → surcharge → cess → annual tax
      → monthly TDS = (annual tax − deducted so far) / months remaining
"""

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
CENTS = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


@dataclass
class Band:
    """One slab or surcharge band. `upto` of None means no upper bound."""

    upto: Decimal | None
    rate: Decimal


@dataclass
class Line:
    label: str
    amount: Decimal
    note: str | None = None


@dataclass
class TaxResult:
    gross_salary: Decimal = ZERO
    other_income: Decimal = ZERO
    exemptions: list[Line] = field(default_factory=list)
    deductions: list[Line] = field(default_factory=list)
    total_exemptions: Decimal = ZERO
    total_deductions: Decimal = ZERO
    taxable_income: Decimal = ZERO

    slab_tax: Decimal = ZERO
    rebate: Decimal = ZERO
    tax_after_rebate: Decimal = ZERO
    surcharge: Decimal = ZERO
    cess: Decimal = ZERO
    annual_tax: Decimal = ZERO

    already_deducted: Decimal = ZERO
    remaining_months: int = 0
    monthly_tds: Decimal = ZERO
    regime_code: str = "new"


def slab_tax(income: Decimal, bands: list[Band]) -> Decimal:
    """Tax across progressive bands. Each band is charged only on the slice
    of income that falls inside it."""
    income = max(money(income), ZERO)
    tax = ZERO
    lower = ZERO

    for band in bands:
        if income <= lower:
            break
        upper = income if band.upto is None else min(money(band.upto), income)
        if upper > lower:
            tax += (upper - lower) * Decimal(band.rate) / Decimal(100)
        lower = money(band.upto) if band.upto is not None else income

    return money(tax)


def surcharge_rate(income: Decimal, bands: list[Band], cap: Decimal) -> tuple[Decimal, Decimal]:
    """Surcharge applies at a single rate on the whole tax, not progressively.

    Returns (rate, threshold) — the threshold is where that band began, which
    marginal relief needs.

    Each band covers (previous upto, this upto]. Testing only `upto is None`
    would make the open-ended top band match every income.
    """
    income = money(income)
    rate = ZERO
    threshold = ZERO
    lower = ZERO

    for band in bands:
        if income <= lower:
            break
        rate = Decimal(band.rate)
        threshold = lower
        if band.upto is None:
            break
        lower = money(band.upto)

    capped = min(rate, Decimal(cap))
    return capped, threshold


def surcharge_with_relief(
    tax: Decimal,
    income: Decimal,
    bands: list[Band],
    cap: Decimal,
    slabs: list[Band],
) -> Decimal:
    """Surcharge, with marginal relief at the band threshold.

    Crossing a threshold by a rupee must not cost more than that rupee: the
    extra tax plus surcharge cannot exceed the income above the threshold.
    """
    rate, threshold = surcharge_rate(income, bands, cap)
    if rate <= ZERO:
        return ZERO

    raw = money(money(tax) * rate / Decimal(100))
    if threshold <= ZERO:
        return raw

    # The comparison point is the full liability at the threshold, which
    # already carries the previous band's surcharge. Leaving it out makes the
    # ceiling far too low and under-charges every income above 1 crore.
    tax_at_threshold = slab_tax(threshold, slabs)
    rate_at_threshold, _ = surcharge_rate(threshold, bands, cap)
    surcharge_at_threshold = money(
        tax_at_threshold * rate_at_threshold / Decimal(100)
    )

    excess = money(income) - money(threshold)
    ceiling = (
        tax_at_threshold + surcharge_at_threshold + excess - money(tax)
    )

    return max(min(raw, ceiling), ZERO)


def apply_rebate(
    tax: Decimal,
    income: Decimal,
    limit: Decimal,
    max_amount: Decimal,
    marginal_relief: bool,
) -> tuple[Decimal, Decimal]:
    """Returns (rebate, tax after rebate).

    Marginal relief stops a rupee over the threshold costing the whole rebate:
    tax can never exceed the amount by which income exceeds the limit.
    """
    limit = money(limit)
    if limit <= ZERO:
        return ZERO, money(tax)

    income = money(income)
    if income <= limit:
        rebate = min(money(tax), money(max_amount))
        return rebate, money(tax) - rebate

    if marginal_relief:
        excess = income - limit
        if money(tax) > excess:
            return money(tax) - excess, excess

    return ZERO, money(tax)


def hra_exemption(
    basic: Decimal, hra_received: Decimal, rent_paid: Decimal, metro: bool
) -> Decimal:
    """The least of: HRA received, rent above 10% of basic, 50/40% of basic."""
    basic = money(basic)
    if basic <= ZERO or money(hra_received) <= ZERO or money(rent_paid) <= ZERO:
        return ZERO

    share = Decimal("50") if metro else Decimal("40")
    return max(
        min(
            money(hra_received),
            money(rent_paid) - basic * Decimal("10") / Decimal(100),
            basic * share / Decimal(100),
        ),
        ZERO,
    )


def compute_annual(
    *,
    gross_salary: Decimal,
    regime,
    slabs: list[Band],
    surcharges: list[Band],
    declarations: dict[str, Decimal] | None = None,
    section_limits: dict[str, Decimal | None] | None = None,
    allowed_sections: set[str] | None = None,
    basic: Decimal = ZERO,
    hra_received: Decimal = ZERO,
    rent_paid: Decimal = ZERO,
    metro: bool = False,
    professional_tax: Decimal = ZERO,
    other_income: Decimal = ZERO,
) -> TaxResult:
    result = TaxResult(
        gross_salary=money(gross_salary),
        other_income=money(other_income),
        regime_code=regime.code,
    )

    income = result.gross_salary + result.other_income

    # ---- exemptions (old regime only) ---------------------------------
    if regime.allow_chapter_vi:
        exempt = hra_exemption(basic, hra_received, rent_paid, metro)
        if exempt > ZERO:
            result.exemptions.append(
                Line("HRA exemption", exempt, "Least of the three statutory tests")
            )

        if money(professional_tax) > ZERO:
            result.exemptions.append(
                Line("Professional tax", money(professional_tax))
            )

    result.total_exemptions = money(sum((e.amount for e in result.exemptions), ZERO))

    # ---- standard deduction -------------------------------------------
    standard = money(regime.standard_deduction)
    if standard > ZERO:
        result.deductions.append(Line("Standard deduction", standard))

    # ---- Chapter VI-A ---------------------------------------------------
    declarations = declarations or {}
    section_limits = section_limits or {}
    allowed = allowed_sections if allowed_sections is not None else set()

    for code, amount in sorted(declarations.items()):
        claimed = money(amount)
        if claimed <= ZERO or code not in allowed:
            continue

        limit = section_limits.get(code)
        capped = min(claimed, money(limit)) if limit is not None else claimed
        note = f"Claimed {claimed}, capped at {money(limit)}" if limit is not None and claimed > money(limit) else None
        result.deductions.append(Line(code, capped, note))

    result.total_deductions = money(sum((d.amount for d in result.deductions), ZERO))

    # ---- taxable income --------------------------------------------------
    result.taxable_income = max(
        income - result.total_exemptions - result.total_deductions, ZERO
    )

    # ---- tax -------------------------------------------------------------
    result.slab_tax = slab_tax(result.taxable_income, slabs)

    result.rebate, result.tax_after_rebate = apply_rebate(
        result.slab_tax,
        result.taxable_income,
        regime.rebate_income_limit,
        regime.rebate_max_amount,
        bool(regime.marginal_relief),
    )

    result.surcharge = surcharge_with_relief(
        result.tax_after_rebate,
        result.taxable_income,
        surcharges,
        regime.surcharge_cap_percent,
        slabs,
    )

    result.cess = money(
        (result.tax_after_rebate + result.surcharge)
        * Decimal(regime.cess_percent)
        / Decimal(100)
    )

    result.annual_tax = money(
        result.tax_after_rebate + result.surcharge + result.cess
    )
    return result


def monthly_tds(
    annual_tax: Decimal, already_deducted: Decimal, remaining_months: int
) -> Decimal:
    """Spread the balance over the months still to be paid."""
    outstanding = money(annual_tax) - money(already_deducted)
    if outstanding <= ZERO or remaining_months <= 0:
        return ZERO
    return money(outstanding / Decimal(remaining_months))

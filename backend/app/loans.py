"""Loan and advance amortisation."""

from datetime import date
from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")
CENTS = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def add_months(period: date, months: int) -> date:
    total = period.month - 1 + months
    return date(period.year + total // 12, total % 12 + 1, 1)


def build_schedule(
    principal: Decimal,
    annual_rate: Decimal,
    method: str,
    instalments: int,
    start_period: date,
) -> list[dict]:
    """One row per instalment. The last row absorbs any rounding remainder so
    the parts always add back to the exact amount owed."""
    principal = money(principal)
    rate = Decimal(str(annual_rate or 0))
    n = int(instalments)
    if n <= 0:
        return []

    rows: list[dict] = []

    if method == "reducing" and rate > ZERO:
        i = rate / Decimal(1200)
        factor = (Decimal(1) + i) ** n
        emi = money(principal * i * factor / (factor - Decimal(1)))

        balance = principal
        for seq in range(1, n + 1):
            interest = money(balance * i)
            part = emi - interest
            if seq == n:  # clear whatever is left
                part = balance
                amount = money(part + interest)
            else:
                amount = emi
            balance = money(balance - part)
            rows.append(
                {
                    "seq": seq,
                    "due_period": add_months(start_period, seq - 1),
                    "principal_part": money(part),
                    "interest_part": interest,
                    "amount": amount,
                }
            )
        return rows

    # Flat interest, or none at all.
    total_interest = (
        money(principal * rate / Decimal(100) * Decimal(n) / Decimal(12))
        if method == "flat" and rate > ZERO
        else ZERO
    )
    total = principal + total_interest

    base = money(total / n)
    principal_each = money(principal / n)
    interest_each = money(total_interest / n) if total_interest else ZERO

    paid = ZERO
    paid_principal = ZERO
    paid_interest = ZERO

    for seq in range(1, n + 1):
        if seq == n:
            amount = money(total - paid)
            part = money(principal - paid_principal)
            interest = money(total_interest - paid_interest)
        else:
            amount, part, interest = base, principal_each, interest_each

        paid += amount
        paid_principal += part
        paid_interest += interest

        rows.append(
            {
                "seq": seq,
                "due_period": add_months(start_period, seq - 1),
                "principal_part": part,
                "interest_part": interest,
                "amount": amount,
            }
        )

    return rows

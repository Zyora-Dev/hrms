"""Amount to words, Indian numbering (lakh / crore)."""

from decimal import Decimal

ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _under_thousand(n: int) -> str:
    if n == 0:
        return ""
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + (f" {ONES[n % 10]}" if n % 10 else "")
    return f"{ONES[n // 100]} Hundred" + (
        f" {_under_thousand(n % 100)}" if n % 100 else ""
    )


def in_words(amount: Decimal | float | int, currency: str = "Rupees") -> str:
    value = Decimal(str(amount or 0))
    whole = int(value)
    paise = int((value - whole) * 100)

    if whole == 0:
        words = "Zero"
    else:
        parts: list[str] = []
        for divisor, label in ((10**7, "Crore"), (10**5, "Lakh"), (1000, "Thousand")):
            if whole >= divisor:
                parts.append(f"{_under_thousand(whole // divisor)} {label}")
                whole %= divisor
        if whole:
            parts.append(_under_thousand(whole))
        words = " ".join(parts)

    text = f"{currency} {words}"
    if paise:
        text += f" and {_under_thousand(paise)} Paise"
    return text + " Only"

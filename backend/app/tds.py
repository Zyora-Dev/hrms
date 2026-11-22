"""TDS helpers: Indian financial year, quarters and deposit due dates."""

from datetime import date, timedelta

# Deduction code treated as income-tax TDS on the payslip.
TDS_CODE = "TDS"


def financial_year(day: date) -> int:
    """FY starting year: April 2026 – March 2027 is 2026."""
    return day.year if day.month >= 4 else day.year - 1


def fy_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def fy_bounds(start_year: int) -> tuple[date, date]:
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def quarter(day: date) -> int:
    """Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar."""
    return ((day.month - 4) % 12) // 3 + 1


def quarter_months(start_year: int, q: int) -> tuple[date, date]:
    first_month = 4 + (q - 1) * 3
    year = start_year + (0 if first_month <= 12 else 1)
    month = first_month if first_month <= 12 else first_month - 12

    start = date(year, month, 1)
    end_month = month + 2
    end_year = year + (1 if end_month > 12 else 0)
    if end_month > 12:
        end_month -= 12

    if end_month == 12:
        end = date(end_year, 12, 31)
    else:
        end = date(end_year, end_month + 1, 1) - timedelta(days=1)
    return start, end


def deposit_due_date(period: date) -> date:
    """Due by the 7th of the following month; March by 30 April."""
    if period.month == 3:
        return date(period.year, 4, 30)
    if period.month == 12:
        return date(period.year + 1, 1, 7)
    return date(period.year, period.month + 1, 7)


def return_due_date(start_year: int, q: int) -> date:
    """Quarterly statement (Form 138) due dates."""
    return {
        1: date(start_year, 7, 31),
        2: date(start_year, 10, 31),
        3: date(start_year + 1, 1, 31),
        4: date(start_year + 1, 5, 31),
    }[q]

"""Building an employee code from a configurable pattern."""

import re
from datetime import date

TOKEN_RE = re.compile(r"\{(SEQ|YYYY|YY|MM|DEPT)\}")

TOKENS = {
    "{SEQ}": "Running number, zero-padded",
    "{YYYY}": "Four-digit year of joining",
    "{YY}": "Two-digit year of joining",
    "{MM}": "Two-digit month of joining",
    "{DEPT}": "First three letters of the department",
}


def validate(pattern: str) -> str:
    pattern = (pattern or "").strip()
    if not pattern:
        raise ValueError("Give a pattern, for example EMP-{SEQ}")
    # Report an unknown token before the missing-{SEQ} rule: a typo like
    # {SEQUENCE} otherwise reports the wrong problem.
    unknown = [
        token
        for token in re.findall(r"\{[^}]*\}", pattern)
        if not TOKEN_RE.fullmatch(token)
    ]
    if unknown:
        raise ValueError(
            f"Unknown token(s): {', '.join(unknown)}. "
            f"Available: {', '.join(TOKENS)}"
        )

    if "{SEQ}" not in pattern:
        raise ValueError("The pattern must include {SEQ} so codes stay unique")

    if len(pattern) > 60:
        raise ValueError("Pattern is too long")
    return pattern


def financial_year(day: date) -> int:
    return day.year if day.month >= 4 else day.year - 1


def build(
    pattern: str,
    sequence: int,
    padding: int,
    joined: date | None = None,
    department: str | None = None,
) -> str:
    day = joined or date.today()
    dept = re.sub(r"[^A-Za-z]", "", department or "")[:3].upper() or "GEN"

    return (
        pattern.replace("{SEQ}", str(sequence).zfill(max(padding, 1)))
        .replace("{YYYY}", f"{day.year:04d}")
        .replace("{YY}", f"{day.year % 100:02d}")
        .replace("{MM}", f"{day.month:02d}")
        .replace("{DEPT}", dept)
    )

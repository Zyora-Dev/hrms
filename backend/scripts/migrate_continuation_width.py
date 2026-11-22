"""Widen shift.max_continuation_shifts so the allowance has no practical cap.

How far a shift may carry on is the company's call, so the column has to hold
more than a single digit of shifts.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_continuation_width
"""

from sqlalchemy import text

from app.db import engine


def main() -> None:
    with engine.begin() as conn:
        precision = conn.execute(
            text(
                "SELECT numeric_precision FROM information_schema.columns "
                "WHERE table_name = 'shift' "
                "AND column_name = 'max_continuation_shifts'"
            )
        ).scalar()

        if precision == 6:
            print("shift.max_continuation_shifts already NUMERIC(6,2)")
            return

        conn.execute(
            text(
                "ALTER TABLE shift ALTER COLUMN max_continuation_shifts "
                "TYPE NUMERIC(6,2)"
            )
        )
        print("shift.max_continuation_shifts widened to NUMERIC(6,2)")


if __name__ == "__main__":
    main()

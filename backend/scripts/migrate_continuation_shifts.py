"""Express a shift's continuation allowance in shifts rather than hours.

Carrying on means working another shift — half or whole — so a flat hour cap
cannot describe it. Existing hour values are converted using each shift's own
length.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_continuation_shifts
"""

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import text

from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata


def column_exists(conn, table: str, column: str) -> bool:
    return bool(
        conn.execute(
            text(
                "SELECT 1 FROM information_schema.columns "
                "WHERE table_name = :t AND column_name = :c"
            ),
            {"t": table, "c": column},
        ).first()
    )


def main() -> None:
    Base.metadata.create_all(engine)

    with engine.begin() as conn:
        if not column_exists(conn, "shift", "max_continuation_shifts"):
            conn.execute(
                text(
                    "ALTER TABLE shift ADD COLUMN max_continuation_shifts "
                    "NUMERIC(3,2) NOT NULL DEFAULT 1"
                )
            )
            print("added shift.max_continuation_shifts")

        if column_exists(conn, "shift", "max_continuation_hours"):
            rows = conn.execute(
                text(
                    "SELECT id, code, start_time, end_time, max_continuation_hours "
                    "FROM shift"
                )
            ).all()

            for row in rows:
                start = row.start_time.hour * 60 + row.start_time.minute
                end = row.end_time.hour * 60 + row.end_time.minute
                if end <= start:
                    end += 24 * 60
                duration = end - start or 1

                # Snap to quarter shifts — "1.33 shifts" reads like noise.
                raw = Decimal(row.max_continuation_hours * 60) / Decimal(duration)
                shifts = (raw * 4).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                ) / 4
                shifts = min(max(shifts, Decimal("0")), Decimal("3"))

                conn.execute(
                    text(
                        "UPDATE shift SET max_continuation_shifts = :v WHERE id = :i"
                    ),
                    {"v": shifts, "i": row.id},
                )
                print(
                    f"{row.code}: {row.max_continuation_hours}h over a "
                    f"{duration // 60}h shift -> {shifts} shifts"
                )

            conn.execute(text("ALTER TABLE shift DROP COLUMN max_continuation_hours"))
            print("dropped shift.max_continuation_hours")


if __name__ == "__main__":
    main()

"""Add the manual-override columns to attendance_day.

Continuation and status are both derived from punches; these columns let an
admin declare a continuation the device missed, dismiss a spill caused by a
stray scan, or mark the day outright.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_continuation_override
"""

from sqlalchemy import text

from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata

COLUMNS = [
    ("continuation_mode", "VARCHAR(12) NOT NULL DEFAULT 'auto'"),
    ("continuation_override_minutes", "INTEGER NOT NULL DEFAULT 0"),
    ("continuation_note", "VARCHAR(255)"),
    ("status_override", "VARCHAR(16)"),
    ("status_note", "VARCHAR(255)"),
]


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
        for name, ddl in COLUMNS:
            if column_exists(conn, "attendance_day", name):
                print(f"attendance_day.{name} already present")
                continue
            conn.execute(text(f"ALTER TABLE attendance_day ADD COLUMN {name} {ddl}"))
            print(f"added attendance_day.{name}")


if __name__ == "__main__":
    main()

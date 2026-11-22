"""Add employee self-service columns and the employee session table.

An employee record grants nothing until an admin switches access on and sets
a password, so every column here defaults to off.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_employee_portal
"""

from sqlalchemy import text

from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata

COLUMNS = [
    ("portal_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("password_hash", "VARCHAR(255)"),
    ("must_change_password", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("password_changed_at", "TIMESTAMPTZ"),
    ("last_login_at", "TIMESTAMPTZ"),
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
    # Creates employee_session (and anything else missing).
    Base.metadata.create_all(engine)
    print("employee_session ready")

    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if column_exists(conn, "employee", name):
                print(f"employee.{name} already present")
                continue
            conn.execute(text(f"ALTER TABLE employee ADD COLUMN {name} {ddl}"))
            print(f"added employee.{name}")


if __name__ == "__main__":
    main()

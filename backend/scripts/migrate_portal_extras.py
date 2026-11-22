"""Attendance regularisation, and notifications that can belong to a person.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_portal_extras
"""

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
    # Creates attendance_regularisation (and anything else missing).
    Base.metadata.create_all(engine)
    print("attendance_regularisation ready")

    with engine.begin() as conn:
        if column_exists(conn, "notification", "employee_id"):
            print("notification.employee_id already present")
            return

        conn.execute(
            text(
                "ALTER TABLE notification ADD COLUMN employee_id INTEGER "
                "REFERENCES employee(id) ON DELETE CASCADE"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX ix_notification_employee_id "
                "ON notification (employee_id)"
            )
        )
        print("added notification.employee_id")


if __name__ == "__main__":
    main()

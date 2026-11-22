"""Create the biometric_device table and employee.device_user_id.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_devices
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
    # Creates biometric_device (and anything else missing).
    Base.metadata.create_all(engine)
    print("biometric_device ready")

    with engine.begin() as conn:
        if column_exists(conn, "employee", "device_user_id"):
            print("employee.device_user_id already present")
            return

        conn.execute(
            text("ALTER TABLE employee ADD COLUMN device_user_id VARCHAR(32)")
        )
        conn.execute(
            text(
                "CREATE INDEX ix_employee_device_user_id "
                "ON employee (device_user_id)"
            )
        )
        print("added employee.device_user_id")


if __name__ == "__main__":
    main()

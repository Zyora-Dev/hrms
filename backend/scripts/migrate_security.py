"""Roles for admins, and Aadhaar moved out of the clear.

Existing Aadhaar numbers are encrypted in place and the plaintext column is
dropped. There is no way back from this without the encryption key, so take a
dump first if the database holds anything you care about.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_security
"""

from sqlalchemy import text

from app import secrets_store
from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata

ADMIN_COLUMNS = [
    ("role", "VARCHAR(12) NOT NULL DEFAULT 'owner'"),
    ("permissions", "JSONB NOT NULL DEFAULT '{}'::jsonb"),
    ("invited_by", "VARCHAR(255)"),
]

EMPLOYEE_COLUMNS = [
    ("aadhaar_encrypted", "TEXT"),
    ("aadhaar_last4", "VARCHAR(4)"),
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
        for name, ddl in ADMIN_COLUMNS:
            if column_exists(conn, "admin_auth", name):
                print(f"admin_auth.{name} already present")
                continue
            conn.execute(text(f"ALTER TABLE admin_auth ADD COLUMN {name} {ddl}"))
            print(f"added admin_auth.{name}")

        for name, ddl in EMPLOYEE_COLUMNS:
            if column_exists(conn, "employee", name):
                print(f"employee.{name} already present")
                continue
            conn.execute(text(f"ALTER TABLE employee ADD COLUMN {name} {ddl}"))
            print(f"added employee.{name}")

        if not column_exists(conn, "employee", "aadhaar"):
            print("employee.aadhaar already removed")
            return

        rows = conn.execute(
            text(
                "SELECT id, aadhaar FROM employee "
                "WHERE aadhaar IS NOT NULL AND aadhaar <> ''"
            )
        ).all()

        for row in rows:
            conn.execute(
                text(
                    "UPDATE employee SET aadhaar_encrypted = :enc, "
                    "aadhaar_last4 = :tail WHERE id = :id"
                ),
                {
                    "enc": secrets_store.encrypt(row.aadhaar),
                    "tail": secrets_store.last4(row.aadhaar),
                    "id": row.id,
                },
            )
        print(f"encrypted {len(rows)} Aadhaar number(s)")

        conn.execute(text("ALTER TABLE employee DROP COLUMN aadhaar"))
        print("dropped employee.aadhaar")


if __name__ == "__main__":
    main()

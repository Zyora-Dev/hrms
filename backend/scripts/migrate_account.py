"""Add the account security columns and the session table.

Two-step sign-in and device management both hang off the admin row, and a
session table is what makes a token revocable before it expires.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_account
"""

from sqlalchemy import text

from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata

COLUMNS = [
    ("name", "VARCHAR(120)"),
    ("password_changed_at", "TIMESTAMPTZ"),
    ("totp_enabled", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("totp_secret", "VARCHAR(64)"),
    ("totp_pending_secret", "VARCHAR(64)"),
    ("totp_enabled_at", "TIMESTAMPTZ"),
    ("backup_codes", "JSONB NOT NULL DEFAULT '[]'::jsonb"),
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
    # Creates admin_session (and anything else missing).
    Base.metadata.create_all(engine)
    print("admin_session ready")

    with engine.begin() as conn:
        for name, ddl in COLUMNS:
            if column_exists(conn, "admin_auth", name):
                print(f"admin_auth.{name} already present")
                continue
            conn.execute(text(f"ALTER TABLE admin_auth ADD COLUMN {name} {ddl}"))
            print(f"added admin_auth.{name}")


if __name__ == "__main__":
    main()

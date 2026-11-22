"""Give the encrypted fields a key of their own.

Without `DATA_ENCRYPTION_KEY` the key is derived from `JWT_SECRET`, which ties
two unrelated secrets together: rotating the JWT secret — exactly what you do
after a leak — would make every stored Aadhaar unreadable, with no plaintext
left to recover from.

This generates a key, re-encrypts what is already stored, and writes it to
`.env`. Run it once, before the database holds anything you cannot lose.

Usage: python -m scripts.set_encryption_key
"""

import sys
from pathlib import Path

from cryptography.fernet import Fernet
from sqlalchemy import select

from app import secrets_store
from app.config import settings
from app.db import SessionLocal
from app.models import Employee

ENV = Path(__file__).resolve().parents[1] / ".env"
SETTING = "DATA_ENCRYPTION_KEY"


def write_env(key: str) -> None:
    lines = ENV.read_text().splitlines() if ENV.exists() else []

    for i, line in enumerate(lines):
        if line.startswith(f"{SETTING}="):
            lines[i] = f"{SETTING}={key}"
            break
    else:
        lines += ["", "# Encrypts Aadhaar at rest. Independent of JWT_SECRET on purpose.",
                  f"{SETTING}={key}"]

    ENV.write_text("\n".join(lines) + "\n")


def main() -> int:
    if settings.DATA_ENCRYPTION_KEY:
        print(f"{SETTING} is already set — nothing to do")
        return 0

    db = SessionLocal()

    # Read everything back with the old, derived key first.
    plain: dict[int, str] = {}
    for employee in db.scalars(
        select(Employee).where(Employee.aadhaar_encrypted.is_not(None))
    ):
        value = secrets_store.decrypt(employee.aadhaar_encrypted)
        if value is None:
            print(
                f"  cannot read the Aadhaar for {employee.employee_code} — "
                "stopping rather than losing it"
            )
            return 1
        plain[employee.id] = value

    key = Fernet.generate_key().decode()
    settings.DATA_ENCRYPTION_KEY = key  # so the re-encrypt below uses it

    for employee_id, value in plain.items():
        employee = db.get(Employee, employee_id)
        employee.aadhaar_encrypted = secrets_store.encrypt(value)
    db.commit()

    # Only touch .env once the data is safely re-encrypted.
    write_env(key)
    db.close()

    print(f"generated {SETTING} and wrote it to .env")
    print(f"re-encrypted {len(plain)} Aadhaar number(s) with it")
    print("restart the API to pick it up")
    return 0


if __name__ == "__main__":
    sys.exit(main())

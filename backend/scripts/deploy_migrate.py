"""Bring a database up to date. Usage: python -m scripts.deploy_migrate

Creates any missing tables, then replays the hand-written migrations in the
order they were written. Every one of them checks before it acts, so running
this on an already-current database is a no-op and it is safe to wire into a
deploy that runs on every push.

There is no Alembic here. If the list below ever grows past the point where
reading it tells you the schema's history, that is the signal to adopt one.
"""

import importlib

from app import audit

# Order matters: later migrations assume the columns earlier ones added.
MIGRATIONS = [
    "migrate_lookups",
    "migrate_continuation_override",
    "migrate_continuation_shifts",
    "migrate_continuation_width",
    "migrate_devices",
    "migrate_account",
    "migrate_employee_portal",
    "migrate_portal_extras",
    "migrate_security",
]


def main() -> None:
    # Schema work is not a decision anyone made; keep it out of the trail.
    audit.mute()

    from scripts import init_db

    print("== init_db")
    init_db.main()

    for name in MIGRATIONS:
        print(f"== {name}")
        importlib.import_module(f"scripts.{name}").main()

    print("\nDatabase is up to date.")


if __name__ == "__main__":
    main()

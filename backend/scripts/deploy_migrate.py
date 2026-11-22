"""Bring a database up to date. Usage: python -m scripts.deploy_migrate

Creates any missing tables, then replays the hand-written migrations in the
order they were written. Every one of them checks before it acts, so running
this on an already-current database is a no-op and it is safe to wire into a
deploy that runs on every push.

There is no Alembic here. If the list below ever grows past the point where
reading it tells you the schema's history, that is the signal to adopt one.
"""

import importlib
import sys

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

# Defaults every install needs. Order is free; none depends on another.
SEEDS = [
    "seed_payroll",
    "seed_tax",
    "seed_letters",
]


def run_quietly(fn) -> None:
    """Call a seed with no argv of our own.

    The seeds read `--reset` straight out of sys.argv, and --reset drops
    rows an admin may have edited. A flag meant for this script would
    otherwise be picked up by all of them.
    """
    argv = sys.argv
    sys.argv = argv[:1]
    try:
        fn()
    finally:
        sys.argv = argv


def main() -> None:
    # Schema work is not a decision anyone made; keep it out of the trail.
    audit.mute()

    from scripts import init_db

    print("== init_db")
    init_db.main()

    for name in MIGRATIONS:
        print(f"== {name}")
        importlib.import_module(f"scripts.{name}").main()

    # Reference data the app cannot function without: leave types, salary
    # components, tax slabs, letter templates. Each seed skips rows that
    # already exist, so edits made in Settings survive every later deploy.
    for name in SEEDS:
        print(f"== {name}")
        run_quietly(importlib.import_module(f"scripts.{name}").main)

    print("\nDatabase is up to date.")
    print("No admin is created here — run `python -m scripts.create_admin "
          "<email> <password>` once, from a shell.")


if __name__ == "__main__":
    main()

"""Seed the built-in letter templates. Existing rows are left untouched so
admin edits survive re-runs.

Usage: python -m scripts.seed_letters [--reset]
"""

import sys

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.letter_defaults import DEFAULT_TEMPLATES
from app.models import LetterTemplate
import app.models  # noqa: F401


def main() -> None:
    reset = "--reset" in sys.argv
    Base.metadata.create_all(engine)

    added = updated = skipped = 0
    with SessionLocal() as db:
        for spec in DEFAULT_TEMPLATES:
            existing = db.scalar(
                select(LetterTemplate).where(LetterTemplate.key == spec["key"])
            )
            if existing:
                if reset:
                    for field, value in spec.items():
                        setattr(existing, field, value)
                    updated += 1
                else:
                    skipped += 1
                continue

            db.add(LetterTemplate(**spec, is_builtin=True))
            added += 1
        db.commit()

    print(f"added={added} updated={updated} skipped={skipped}")


if __name__ == "__main__":
    main()

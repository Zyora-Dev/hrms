"""Move employee.designation / employee.department from free text to lookup tables.

Idempotent: safe to run more than once.

Usage: python -m scripts.migrate_lookups
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
    # Creates department/designation (and anything else missing).
    Base.metadata.create_all(engine)

    with engine.begin() as conn:
        for kind in ("designation", "department"):
            old, new = kind, f"{kind}_id"

            if not column_exists(conn, "employee", old):
                print(f"employee.{old} already migrated — skipping")
                continue

            # 1. Seed the lookup table from distinct existing values.
            conn.execute(
                text(
                    f"INSERT INTO {kind} (name, is_active) "
                    f"SELECT DISTINCT btrim({old}), true FROM employee "
                    f"WHERE {old} IS NOT NULL AND btrim({old}) <> '' "
                    f"ON CONFLICT (name) DO NOTHING"
                )
            )

            # 2. Add the FK column if the model hasn't already created it.
            if not column_exists(conn, "employee", new):
                conn.execute(
                    text(
                        f"ALTER TABLE employee ADD COLUMN {new} INTEGER "
                        f"REFERENCES {kind}(id) ON DELETE RESTRICT"
                    )
                )

            # 3. Point each employee at its lookup row.
            conn.execute(
                text(
                    f"UPDATE employee e SET {new} = l.id FROM {kind} l "
                    f"WHERE btrim(e.{old}) = l.name AND e.{new} IS NULL"
                )
            )

            moved = conn.execute(
                text(f"SELECT count(*) FROM employee WHERE {new} IS NOT NULL")
            ).scalar()
            seeded = conn.execute(text(f"SELECT count(*) FROM {kind}")).scalar()

            # 4. Drop the old text column.
            conn.execute(text(f"ALTER TABLE employee DROP COLUMN {old}"))
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS ix_employee_{new} ON employee ({new})")
            )

            print(f"{kind}: {seeded} rows seeded, {moved} employees linked")

    print("done")


if __name__ == "__main__":
    main()

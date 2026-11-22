"""Create any missing tables. Usage: python -m scripts.init_db"""

from app.db import Base, engine
import app.models  # noqa: F401  — registers models on Base.metadata


def main() -> None:
    Base.metadata.create_all(engine)
    print("Tables:", ", ".join(sorted(Base.metadata.tables)))


if __name__ == "__main__":
    main()

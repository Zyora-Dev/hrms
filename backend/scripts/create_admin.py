"""Create admin_auth table (if missing) and upsert an admin user.

Usage: python -m scripts.create_admin <email> <password>
"""

import sys

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Admin
from app.security import hash_password


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("Usage: python -m scripts.create_admin <email> <password>")

    email, password = sys.argv[1].lower(), sys.argv[2]
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        admin = db.scalar(select(Admin).where(Admin.email == email))
        if admin:
            admin.password_hash = hash_password(password)
            action = "updated"
        else:
            db.add(Admin(email=email, password_hash=hash_password(password)))
            action = "created"
        db.commit()

    print(f"Admin {action}: {email}")


if __name__ == "__main__":
    main()

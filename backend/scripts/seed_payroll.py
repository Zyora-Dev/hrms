"""Seed a starting salary structure and leave policy.

These are only defaults — every field is editable in Settings afterwards.
Existing rows are left alone, so re-running is safe.

Usage: python -m scripts.seed_payroll
"""

from decimal import Decimal

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import LeaveType, SalaryComponent
import app.models  # noqa: F401

COMPONENTS = [
    dict(code="BASIC", name="Basic", kind="earning", calculation="percent_of_gross",
         value=Decimal("50"), include_in_pf=True, sort_order=1),
    dict(code="HRA", name="House Rent Allowance", kind="earning",
         calculation="percent_of_basic", value=Decimal("40"), sort_order=2),
    dict(code="CONV", name="Conveyance", kind="earning", calculation="fixed",
         value=Decimal("1600"), sort_order=3),
    dict(code="SPECIAL", name="Special Allowance", kind="earning",
         calculation="balance", value=Decimal("0"), sort_order=4),
]

LEAVE_TYPES = [
    # Matches the stated policy: nothing carries forward, the balance is paid out.
    dict(code="EL", name="Earned Leave", monthly_accrual=Decimal("1.5"),
         carry_forward=False, encash_unused=True, encashment_percent=Decimal("100")),
    dict(code="CL", name="Casual Leave", monthly_accrual=Decimal("1"),
         carry_forward=False, encash_unused=False),
    dict(code="SL", name="Sick Leave", monthly_accrual=Decimal("0.5"),
         carry_forward=False, encash_unused=False),
]


def main() -> None:
    Base.metadata.create_all(engine)
    added = skipped = 0

    with SessionLocal() as db:
        for spec in COMPONENTS:
            if db.scalar(select(SalaryComponent).where(SalaryComponent.code == spec["code"])):
                skipped += 1
                continue
            db.add(SalaryComponent(**spec))
            added += 1

        for spec in LEAVE_TYPES:
            if db.scalar(select(LeaveType).where(LeaveType.code == spec["code"])):
                skipped += 1
                continue
            db.add(LeaveType(**spec))
            added += 1

        db.commit()

    print(f"added={added} skipped={skipped}")


if __name__ == "__main__":
    main()

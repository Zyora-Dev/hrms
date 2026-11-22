"""Seed tax regimes, slabs, surcharge bands and deduction sections.

Figures are for FY 2026-27 (Budget 2026 left the Budget 2025 structure
unchanged). They are seed values only — every one is editable in Settings,
and must be checked against the current Finance Act before a real pay run.

Usage: python -m scripts.seed_tax [--year 2026] [--reset]
"""

import sys
from decimal import Decimal as D

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import DeductionSection, TaxRegime, TaxSlab, TaxSurcharge
import app.models  # noqa: F401

NEW_SLABS = [
    (D("400000"), D("0")),
    (D("800000"), D("5")),
    (D("1200000"), D("10")),
    (D("1600000"), D("15")),
    (D("2000000"), D("20")),
    (D("2400000"), D("25")),
    (None, D("30")),
]

OLD_SLABS = [
    (D("250000"), D("0")),
    (D("500000"), D("5")),
    (D("1000000"), D("20")),
    (None, D("30")),
]

# Shared bands; the new regime caps the top rate at 25%.
SURCHARGE = [
    (D("5000000"), D("0")),
    (D("10000000"), D("10")),
    (D("20000000"), D("15")),
    (D("50000000"), D("25")),
    (None, D("37")),
]

REGIMES = [
    dict(
        code="new",
        name="New regime (default)",
        standard_deduction=D("75000"),
        rebate_income_limit=D("1200000"),
        rebate_max_amount=D("60000"),
        marginal_relief=True,
        cess_percent=D("4"),
        surcharge_cap_percent=D("25"),
        allow_chapter_vi=False,
        is_default=True,
        slabs=NEW_SLABS,
    ),
    dict(
        code="old",
        name="Old regime",
        standard_deduction=D("50000"),
        rebate_income_limit=D("500000"),
        rebate_max_amount=D("12500"),
        marginal_relief=False,
        cess_percent=D("4"),
        surcharge_cap_percent=D("37"),
        allow_chapter_vi=True,
        is_default=False,
        slabs=OLD_SLABS,
    ),
]

SECTIONS = [
    ("80C", "Life insurance, PF, ELSS, tuition fees, principal repayment", D("150000"), True, False, 1),
    ("80CCD1B", "Additional NPS contribution", D("50000"), True, False, 2),
    ("80CCD2", "Employer contribution to NPS", None, True, True, 3),
    ("80D", "Health insurance premium", D("25000"), True, False, 4),
    ("80DD", "Maintenance of a dependant with disability", D("75000"), True, False, 5),
    ("80E", "Interest on an education loan", None, True, False, 6),
    ("80G", "Donations", None, True, False, 7),
    ("80TTA", "Interest on a savings account", D("10000"), True, False, 8),
    ("24B", "Interest on a home loan, self-occupied", D("200000"), True, False, 9),
]


def main() -> None:
    year = 2026
    if "--year" in sys.argv:
        year = int(sys.argv[sys.argv.index("--year") + 1])
    reset = "--reset" in sys.argv

    Base.metadata.create_all(engine)
    added = skipped = 0

    with SessionLocal() as db:
        for spec in REGIMES:
            slabs = spec.pop("slabs")
            existing = db.scalar(
                select(TaxRegime).where(
                    TaxRegime.financial_year == year, TaxRegime.code == spec["code"]
                )
            )
            if existing and not reset:
                skipped += 1
                spec["slabs"] = slabs
                continue
            if existing:
                db.delete(existing)
                db.flush()

            regime = TaxRegime(financial_year=year, **spec)
            db.add(regime)
            db.flush()

            for seq, (upto, rate) in enumerate(slabs, start=1):
                db.add(
                    TaxSlab(regime_id=regime.id, seq=seq, upto=upto, rate_percent=rate)
                )
            for seq, (upto, rate) in enumerate(SURCHARGE, start=1):
                db.add(
                    TaxSurcharge(
                        regime_id=regime.id, seq=seq, upto=upto, rate_percent=rate
                    )
                )
            added += 1
            spec["slabs"] = slabs

        for code, name, limit, old, new, order in SECTIONS:
            if db.scalar(select(DeductionSection).where(DeductionSection.code == code)):
                skipped += 1
                continue
            db.add(
                DeductionSection(
                    code=code,
                    name=name,
                    max_amount=limit,
                    allowed_in_old=old,
                    allowed_in_new=new,
                    sort_order=order,
                )
            )
            added += 1

        db.commit()

    print(f"FY {year}-{str(year + 1)[-2:]}: added={added} skipped={skipped}")
    print("Check these against the current Finance Act before running payroll.")


if __name__ == "__main__":
    main()

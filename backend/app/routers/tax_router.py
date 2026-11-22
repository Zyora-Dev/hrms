from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import tax as engine
from app import tds as fy_helper
from app.db import get_db
from app.models import (
    Admin,
    DeductionSection,
    Employee,
    PayrollRun,
    PayrollSettings,
    Payslip,
    TaxDeclaration,
    TaxRegime,
    TaxSlab,
    TaxSurcharge,
)
from app.routers.auth import current_admin
from app.schemas import (
    DeductionSectionBase,
    DeductionSectionOut,
    RegimeComparison,
    TaxComputationOut,
    TaxDeclarationOut,
    TaxDeclarationUpdate,
    TaxRegimeOut,
    TaxRegimeUpdate,
)

router = APIRouter(prefix="/tax", tags=["tax"])

ZERO = Decimal("0")
TDS_CODE = "TDS"


def bands(rows) -> list[engine.Band]:
    return [engine.Band(upto=r.upto, rate=r.rate_percent) for r in rows]


def get_regime(db: Session, year: int, code: str) -> TaxRegime:
    regime = db.scalar(
        select(TaxRegime).where(
            TaxRegime.financial_year == year, TaxRegime.code == code
        )
    )
    if not regime:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No {code} regime configured for FY {fy_helper.fy_label(year)}. "
            "Seed or add it in Settings.",
        )
    return regime


def settings_row(db: Session) -> PayrollSettings:
    row = db.scalar(select(PayrollSettings).order_by(PayrollSettings.id).limit(1))
    if row is None:
        row = PayrollSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def declaration_for(db: Session, employee_id: int, year: int) -> TaxDeclaration | None:
    return db.scalar(
        select(TaxDeclaration).where(
            TaxDeclaration.employee_id == employee_id,
            TaxDeclaration.financial_year == year,
        )
    )


def component_total(slip: Payslip, codes: set[str]) -> Decimal:
    total = ZERO
    for line in slip.earnings or []:
        if str(line.get("code", "")).upper() in codes:
            total += Decimal(str(line.get("amount", "0")))
    return total


def year_to_date(
    db: Session, employee_id: int, year: int, upto_period: date | None = None
) -> tuple[Decimal, Decimal, Decimal, Decimal, int]:
    """Returns (gross, basic, hra, tds already deducted, months processed)."""
    start, end = fy_helper.fy_bounds(year)
    if upto_period:
        end = min(end, upto_period)

    rows = db.scalars(
        select(Payslip)
        .join(PayrollRun, Payslip.run_id == PayrollRun.id)
        .where(PayrollRun.period >= start, PayrollRun.period <= end)
        .where(Payslip.employee_id == employee_id)
    ).unique()

    gross = basic = hra = tds = ZERO
    months = 0
    for slip in rows:
        months += 1
        gross += Decimal(slip.gross_pay or 0)
        basic += component_total(slip, {"BASIC"})
        hra += component_total(slip, {"HRA"})
        for line in slip.deductions or []:
            if str(line.get("code", "")).upper() == TDS_CODE:
                tds += Decimal(str(line.get("amount", "0")))

    return gross, basic, hra, tds, months


def compute_for(
    db: Session,
    employee: Employee,
    year: int,
    regime_code: str | None = None,
    upto_period: date | None = None,
) -> TaxComputationOut:
    """Project the year from what has been paid plus what is still to come."""
    declaration = declaration_for(db, employee.id, year)
    settings = settings_row(db)

    code = regime_code or (
        declaration.regime_code if declaration else settings.tds_default_regime
    )
    regime = get_regime(db, year, code)

    earned, basic_ytd, hra_ytd, deducted, months = year_to_date(
        db, employee.id, year, upto_period
    )

    monthly_gross = (
        Decimal(employee.ctc_annual) / Decimal(12) if employee.ctc_annual else ZERO
    )
    remaining = max(12 - months, 0)
    projected_remaining = monthly_gross * remaining
    annual_gross = earned + projected_remaining

    # Project basic and HRA on the same ratio, so the HRA test stays sensible
    # for someone mid-year.
    basic_annual = (
        basic_ytd / Decimal(months) * Decimal(12) if months else monthly_gross / 2
    )
    hra_annual = hra_ytd / Decimal(months) * Decimal(12) if months else ZERO

    sections = list(db.scalars(select(DeductionSection).where(DeductionSection.is_active.is_(True))))
    allowed = {
        s.code
        for s in sections
        if (regime.allow_chapter_vi and s.allowed_in_old) or s.allowed_in_new
    }
    limits = {s.code: s.max_amount for s in sections}

    declared = {
        str(item.get("code")): Decimal(str(item.get("amount", "0")))
        for item in (declaration.items if declaration else [])
    }

    result = engine.compute_annual(
        gross_salary=annual_gross,
        regime=regime,
        slabs=bands(regime.slabs),
        surcharges=bands(regime.surcharges),
        declarations=declared,
        section_limits=limits,
        allowed_sections=allowed,
        basic=basic_annual,
        hra_received=hra_annual,
        rent_paid=declaration.hra_rent_paid if declaration else ZERO,
        metro=bool(declaration.hra_metro) if declaration else False,
        professional_tax=(
            Decimal(settings.pt_amount) * 12 if settings.pt_enabled else ZERO
        ),
        other_income=declaration.other_income if declaration else ZERO,
    )

    monthly = engine.monthly_tds(result.annual_tax, deducted, remaining or 1)

    return TaxComputationOut(
        employee_id=employee.id,
        employee_name=employee.full_name,
        employee_code=employee.employee_code,
        financial_year=year,
        regime_code=regime.code,
        regime_name=regime.name,
        gross_salary=result.gross_salary,
        other_income=result.other_income,
        exemptions=[
            {"label": e.label, "amount": e.amount, "note": e.note}
            for e in result.exemptions
        ],
        deductions=[
            {"label": d.label, "amount": d.amount, "note": d.note}
            for d in result.deductions
        ],
        total_exemptions=result.total_exemptions,
        total_deductions=result.total_deductions,
        taxable_income=result.taxable_income,
        slab_tax=result.slab_tax,
        rebate=result.rebate,
        tax_after_rebate=result.tax_after_rebate,
        surcharge=result.surcharge,
        cess=result.cess,
        annual_tax=result.annual_tax,
        already_deducted=deducted,
        remaining_months=remaining,
        monthly_tds=monthly,
        months_elapsed=months,
        earned_so_far=earned,
        projected_remaining=projected_remaining,
    )


# --------------------------------------------------------------------------
# Regimes and slabs
# --------------------------------------------------------------------------


@router.get("/regimes", response_model=list[TaxRegimeOut])
def list_regimes(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
):
    stmt = select(TaxRegime)
    if financial_year is not None:
        stmt = stmt.where(TaxRegime.financial_year == financial_year)
    return list(
        db.scalars(stmt.order_by(TaxRegime.financial_year.desc(), TaxRegime.code))
    )


@router.put("/regimes/{regime_id}", response_model=TaxRegimeOut)
def update_regime(
    regime_id: int,
    payload: TaxRegimeUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    regime = db.get(TaxRegime, regime_id)
    if not regime:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regime not found")

    data = payload.model_dump()
    slabs = data.pop("slabs")
    surcharges = data.pop("surcharges")
    for field, value in data.items():
        setattr(regime, field, value)

    regime.slabs.clear()
    regime.surcharges.clear()
    db.flush()

    for seq, band in enumerate(slabs, start=1):
        db.add(TaxSlab(regime_id=regime.id, seq=seq, **band))
    for seq, band in enumerate(surcharges, start=1):
        db.add(TaxSurcharge(regime_id=regime.id, seq=seq, **band))

    db.commit()
    db.refresh(regime)
    return regime


@router.get("/sections", response_model=list[DeductionSectionOut])
def list_sections(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    return list(
        db.scalars(select(DeductionSection).order_by(DeductionSection.sort_order))
    )


@router.post(
    "/sections", response_model=DeductionSectionOut, status_code=status.HTTP_201_CREATED
)
def create_section(
    payload: DeductionSectionBase,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(DeductionSection).where(DeductionSection.code == payload.code)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Section {payload.code} already exists"
        )
    row = DeductionSection(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put("/sections/{section_id}", response_model=DeductionSectionOut)
def update_section(
    section_id: int,
    payload: DeductionSectionBase,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(DeductionSection, section_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/sections/{section_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_section(
    section_id: int, db: Session = Depends(get_db), _: Admin = Depends(current_admin)
):
    row = db.get(DeductionSection, section_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Section not found")
    db.delete(row)
    db.commit()


# --------------------------------------------------------------------------
# Declarations
# --------------------------------------------------------------------------


def declaration_out(row: TaxDeclaration) -> TaxDeclarationOut:
    out = TaxDeclarationOut.model_validate(row)
    if row.employee:
        out.employee_name = row.employee.full_name
        out.employee_code = row.employee.employee_code
    return out


@router.get("/declarations", response_model=list[TaxDeclarationOut])
def list_declarations(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    employee_id: int | None = None,
):
    stmt = select(TaxDeclaration)
    if financial_year is not None:
        stmt = stmt.where(TaxDeclaration.financial_year == financial_year)
    if employee_id is not None:
        stmt = stmt.where(TaxDeclaration.employee_id == employee_id)
    return [declaration_out(r) for r in db.scalars(stmt).unique()]


@router.put("/declarations/{employee_id}", response_model=TaxDeclarationOut)
def save_declaration(
    employee_id: int,
    payload: TaxDeclarationUpdate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if not db.get(Employee, employee_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    row = declaration_for(db, employee_id, payload.financial_year)
    if row is None:
        row = TaxDeclaration(
            employee_id=employee_id, financial_year=payload.financial_year
        )
        db.add(row)

    data = payload.model_dump()
    data["items"] = [
        {"code": i["code"], "amount": str(i["amount"])} for i in data["items"]
    ]
    for field, value in data.items():
        setattr(row, field, value)

    db.commit()
    db.refresh(row)
    return declaration_out(row)


# --------------------------------------------------------------------------
# Computation
# --------------------------------------------------------------------------


@router.get("/compute", response_model=list[TaxComputationOut])
def compute_all(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
):
    """Everyone at once — the overview would otherwise make one call each.

    Declared before `/compute/{employee_id}` so the literal path is not
    swallowed by the parameterised one.
    """
    year = financial_year or fy_helper.financial_year(date.today())
    employees = db.scalars(
        select(Employee)
        .where(Employee.status == "active")
        .order_by(Employee.employee_code)
    )

    out = []
    for employee in employees:
        try:
            out.append(compute_for(db, employee, year))
        except HTTPException:
            # No regime defined for the year — nothing to show for anyone.
            break
    return out


@router.get("/compute/{employee_id}", response_model=TaxComputationOut)
def compute(
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
    regime: str | None = Query(default=None, pattern="^(new|old)$"),
):
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    year = financial_year or fy_helper.financial_year(date.today())
    return compute_for(db, employee, year, regime)


@router.get("/compare/{employee_id}", response_model=RegimeComparison)
def compare(
    employee_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    financial_year: int | None = None,
):
    """Which regime costs this employee less, on their declaration."""
    employee = db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")

    year = financial_year or fy_helper.financial_year(date.today())
    new = compute_for(db, employee, year, "new")
    old = compute_for(db, employee, year, "old")

    better = "new" if new.annual_tax <= old.annual_tax else "old"
    return RegimeComparison(
        employee_id=employee_id,
        financial_year=year,
        new_regime=new,
        old_regime=old,
        better=better,
        saving=abs(new.annual_tax - old.annual_tax),
    )

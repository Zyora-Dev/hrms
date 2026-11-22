"""Company expenses: what was spent, on what, and whether it has been paid.

Employee reimbursements are not duplicated here — they are their own records
with their own approval. The summary folds them in so a month's total is the
real total, but marks them as coming from claims so nobody tries to edit one
from this screen.
"""

import csv
import io
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from math import ceil

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app import audit
from app.db import get_db
from app.models import Admin, Expense, ExpenseCategory, ReimbursementClaim
from app.routers.auth import current_admin
from app.schemas import (
    CategorySpend,
    ExpenseCategoryBase,
    ExpenseCategoryOut,
    ExpenseCreate,
    ExpenseOut,
    ExpensePage,
    ExpenseSummary,
    MonthSpend,
)
from app.uploads import DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, delete_upload, save_upload

router = APIRouter(prefix="/expenses", tags=["expenses"])

ZERO = Decimal("0")

# Enough to start with; an admin can rename or add to these.
STARTER_CATEGORIES = [
    ("Rent & utilities", "RENT", 0),
    ("Software & subscriptions", "SOFTWARE", 1),
    ("Hardware & equipment", "HARDWARE", 2),
    ("Travel", "TRAVEL", 3),
    ("Marketing", "MARKETING", 4),
    ("Professional fees", "PROFESSIONAL", 5),
    ("Office supplies", "SUPPLIES", 6),
    ("Statutory & taxes", "STATUTORY", 7),
    ("Other", "OTHER", 8),
]


def month_start(day: date) -> date:
    return day.replace(day=1)


def next_month(day: date) -> date:
    return (
        day.replace(year=day.year + 1, month=1)
        if day.month == 12
        else day.replace(month=day.month + 1)
    )


def ensure_categories(db: Session) -> None:
    if db.scalar(select(func.count(ExpenseCategory.id))):
        return
    for name, code, order in STARTER_CATEGORIES:
        db.add(ExpenseCategory(name=name, code=code, sort_order=order))
    db.commit()


def to_out(row: Expense) -> ExpenseOut:
    out = ExpenseOut.model_validate(row, from_attributes=True)
    out.category_name = row.category.name if row.category else None
    out.category_code = row.category.code if row.category else None
    if row.employee:
        out.employee_name = row.employee.full_name
        out.employee_code = row.employee.employee_code
    return out


def next_reference(db: Session) -> str:
    count = db.scalar(select(func.count(Expense.id))) or 0
    return f"EXP-{count + 1:05d}"


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


@router.get("/categories", response_model=list[ExpenseCategoryOut])
def list_categories(db: Session = Depends(get_db), _: Admin = Depends(current_admin)):
    ensure_categories(db)

    first = month_start(date.today())
    spent = dict(
        db.execute(
            select(Expense.category_id, func.sum(Expense.total_amount))
            .where(Expense.spent_on >= first, Expense.spent_on < next_month(first))
            .group_by(Expense.category_id)
        ).all()
    )

    rows = db.scalars(
        select(ExpenseCategory).order_by(
            ExpenseCategory.sort_order, ExpenseCategory.name
        )
    )
    out = []
    for row in rows:
        item = ExpenseCategoryOut.model_validate(row)
        item.spent_this_month = Decimal(str(spent.get(row.id, 0)))
        out.append(item)
    return out


@router.post(
    "/categories", response_model=ExpenseCategoryOut, status_code=status.HTTP_201_CREATED
)
def create_category(
    payload: ExpenseCategoryBase,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    if db.scalar(select(ExpenseCategory).where(ExpenseCategory.code == payload.code)):
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"{payload.code} is already in use"
        )
    row = ExpenseCategory(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return ExpenseCategoryOut.model_validate(row)


@router.put("/categories/{category_id}", response_model=ExpenseCategoryOut)
def update_category(
    category_id: int,
    payload: ExpenseCategoryBase,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(ExpenseCategory, category_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return ExpenseCategoryOut.model_validate(row)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(ExpenseCategory, category_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")

    used = db.scalar(
        select(func.count(Expense.id)).where(Expense.category_id == category_id)
    )
    if used:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"{used} expense(s) use this category — switch it off instead",
        )

    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Expenses
# ---------------------------------------------------------------------------


def filtered(
    date_from: date | None,
    date_to: date | None,
    category_id: int | None,
    expense_status: str | None,
    employee_id: int | None,
    q: str | None,
):
    stmt = select(Expense)
    if date_from:
        stmt = stmt.where(Expense.spent_on >= date_from)
    if date_to:
        stmt = stmt.where(Expense.spent_on <= date_to)
    if category_id:
        stmt = stmt.where(Expense.category_id == category_id)
    if expense_status:
        stmt = stmt.where(Expense.status == expense_status)
    if employee_id:
        stmt = stmt.where(Expense.employee_id == employee_id)
    if q:
        term = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Expense.title).like(term),
                func.lower(Expense.vendor).like(term),
                func.lower(Expense.reference).like(term),
                func.lower(Expense.invoice_number).like(term),
            )
        )
    return stmt


@router.get("", response_model=ExpensePage)
def list_expenses(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    expense_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = None,
    q: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    stmt = filtered(date_from, date_to, category_id, expense_status, employee_id, q)

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    summed = db.scalar(
        select(func.coalesce(func.sum(Expense.total_amount), 0)).select_from(
            stmt.subquery()
        )
    )

    rows = db.scalars(
        stmt.order_by(Expense.spent_on.desc(), Expense.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique()

    return ExpensePage(
        items=[to_out(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
        sum_amount=Decimal(str(summed or 0)),
    )


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    admin: Admin = Depends(current_admin),
):
    if not db.get(ExpenseCategory, payload.category_id):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "That category does not exist"
        )

    data = payload.model_dump()
    row = Expense(
        **data,
        reference=next_reference(db),
        total_amount=payload.amount + payload.tax_amount,
        recorded_by=admin.email,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    audit.record(
        db,
        action="create",
        entity="expense",
        entity_id=row.id,
        label=f"{row.reference} · {row.title}",
        summary=f"Expense recorded for {row.total_amount}",
    )
    return to_out(row)


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(Expense, expense_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")

    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    row.total_amount = payload.amount + payload.tax_amount

    db.commit()
    db.refresh(row)
    return to_out(row)


@router.post("/{expense_id}/receipt", response_model=ExpenseOut)
def attach_receipt(
    expense_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(Expense, expense_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")

    # Replacing one should not leave the old file behind.
    delete_upload(row.receipt_path)
    row.receipt_path = save_upload(
        file,
        folder="expenses",
        prefix=row.reference,
        allowed=DOCUMENT_TYPES,
        max_bytes=MAX_DOCUMENT_BYTES,
    )
    db.commit()
    db.refresh(row)
    return to_out(row)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
):
    row = db.get(Expense, expense_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")

    audit.record(
        db,
        action="delete",
        entity="expense",
        entity_id=row.id,
        label=f"{row.reference} · {row.title}",
        summary=f"Expense of {row.total_amount} deleted",
        commit=False,
    )
    delete_upload(row.receipt_path)
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Where the money went
# ---------------------------------------------------------------------------


@router.get("/summary", response_model=ExpenseSummary)
def summary(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
):
    today = date.today()
    date_from = date_from or month_start(today)
    date_to = date_to or today

    rows = list(
        db.scalars(
            select(Expense).where(
                Expense.spent_on >= date_from, Expense.spent_on <= date_to
            )
        ).unique()
    )

    by_category: dict[int, Decimal] = defaultdict(lambda: ZERO)
    by_month: dict[date, Decimal] = defaultdict(lambda: ZERO)
    direct = unpaid = ZERO

    for row in rows:
        amount = Decimal(str(row.total_amount))
        direct += amount
        by_category[row.category_id] += amount
        by_month[month_start(row.spent_on)] += amount
        if row.status != "paid":
            unpaid += amount

    # Reimbursements are spending too, even though they live elsewhere.
    claim_months: dict[date, Decimal] = defaultdict(lambda: ZERO)
    claims = ZERO
    for claim in db.scalars(
        select(ReimbursementClaim).where(
            ReimbursementClaim.status.in_(("approved", "paid")),
            ReimbursementClaim.spent_on >= date_from,
            ReimbursementClaim.spent_on <= date_to,
        )
    ).unique():
        amount = Decimal(str(claim.approved_amount or claim.amount))
        claims += amount
        claim_months[month_start(claim.spent_on)] += amount

    total = direct + claims

    categories = []
    for category in db.scalars(
        select(ExpenseCategory).order_by(
            ExpenseCategory.sort_order, ExpenseCategory.name
        )
    ):
        spent = by_category.get(category.id, ZERO)
        if spent == ZERO and not category.is_active:
            continue
        budget = (
            Decimal(str(category.monthly_budget))
            if category.monthly_budget is not None
            else None
        )
        categories.append(
            CategorySpend(
                category_id=category.id,
                name=category.name,
                code=category.code,
                spent=spent,
                budget=budget,
                share=float(round(spent * 100 / total, 1)) if total else 0.0,
                over_budget=bool(budget is not None and spent > budget),
            )
        )

    if claims > ZERO:
        categories.append(
            CategorySpend(
                name="Staff reimbursements",
                spent=claims,
                share=float(round(claims * 100 / total, 1)) if total else 0.0,
                from_claims=True,
            )
        )

    categories.sort(key=lambda c: c.spent, reverse=True)

    months = sorted(set(by_month) | set(claim_months))
    return ExpenseSummary(
        date_from=date_from,
        date_to=date_to,
        direct=direct,
        claims=claims,
        total=total,
        unpaid=unpaid,
        budget=sum(
            (c.budget for c in categories if c.budget is not None), ZERO
        ),
        categories=categories,
        months=[
            MonthSpend(
                period=m,
                spent=by_month.get(m, ZERO),
                claims=claim_months.get(m, ZERO),
            )
            for m in months
        ],
    )


@router.get("/export.csv")
def export_csv(
    db: Session = Depends(get_db),
    _: Admin = Depends(current_admin),
    date_from: date | None = None,
    date_to: date | None = None,
    category_id: int | None = None,
    expense_status: str | None = Query(default=None, alias="status"),
    q: str | None = None,
):
    stmt = filtered(date_from, date_to, category_id, expense_status, None, q)
    rows = db.scalars(stmt.order_by(Expense.spent_on)).unique()

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Reference", "Date", "Category", "Title", "Vendor", "Invoice",
            "GSTIN", "Amount", "Tax", "Total", "Mode", "Status", "Paid on",
            "For employee", "Recorded by",
        ]
    )
    for row in rows:
        writer.writerow(
            [
                row.reference,
                row.spent_on.isoformat(),
                row.category.name if row.category else "",
                row.title,
                row.vendor or "",
                row.invoice_number or "",
                row.gstin or "",
                row.amount,
                row.tax_amount,
                row.total_amount,
                row.payment_mode,
                row.status,
                row.paid_on.isoformat() if row.paid_on else "",
                row.employee.employee_code if row.employee else "",
                row.recorded_by or "",
            ]
        )

    stamp = f"{date_from or 'all'}_{date_to or ''}".strip("_")
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="expenses-{stamp}.csv"'},
    )

"""The audit trail.

Rather than asking every router to remember to write a log line, this listens
to the session: anything inserted, changed or deleted is compared field by
field and recorded with whoever was logged in at the time.

Two things are deliberately kept out:

  * computed attendance — recompute rewrites thousands of rows a day and none
    of it is a decision anyone made. Only the columns an admin can set by hand
    are watched.
  * payslips and the audit table itself, for the same reason.

Anything the trail cannot express as a row change — a login, a fetch from a
terminal — is recorded by calling `record()` directly.
"""

from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.models import AuditLog

# ---------------------------------------------------------------------------
# Who is doing it
# ---------------------------------------------------------------------------


@dataclass
class Context:
    admin_id: int | None = None
    admin_email: str | None = None
    method: str | None = None
    path: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    # Set while replaying or seeding, to keep machine work out of the trail.
    muted: bool = False
    extra: dict = field(default_factory=dict)


_context: ContextVar[Context] = ContextVar("audit_context", default=Context())


def current() -> Context:
    return _context.get()


def set_request(
    *,
    method: str | None = None,
    path: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    ctx = Context(
        admin_id=current().admin_id,
        admin_email=current().admin_email,
        method=method,
        path=path,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    _context.set(ctx)


def set_admin(admin_id: int | None, admin_email: str | None) -> None:
    ctx = current()
    ctx.admin_id = admin_id
    ctx.admin_email = admin_email
    _context.set(ctx)


def mute() -> None:
    ctx = current()
    ctx.muted = True
    _context.set(ctx)


# ---------------------------------------------------------------------------
# What is watched
# ---------------------------------------------------------------------------

# Machine-written rows: logging them would bury the decisions in noise.
IGNORED_TABLES = {
    "audit_log",
    "payslip",
    "leave_balance",
    "loan_instalment",
    # Every authenticated request stamps `last_seen_at` on its session. That
    # is housekeeping, and logging it would bury everything else.
    "admin_session",
    "employee_session",
    "notification",
    "email_message",
}

# Attendance days are rebuilt constantly by the engine. Only the columns an
# admin can set by hand are worth a line in the trail.
WATCHED_COLUMNS = {
    "attendance_day": {
        "status_override",
        "status_note",
        "continuation_mode",
        "continuation_override_minutes",
        "continuation_note",
    }
}

# Never written to the trail, whatever table they are on.
SECRET_COLUMNS = {"password_hash", "password", "token", "secret"}

# Stamps the system keeps for itself. A change to one of these alone is not
# a decision anyone made — signing in already has its own entry, and logging
# "changed last login at" beside it says nothing extra.
HOUSEKEEPING_COLUMNS = {
    "last_login_at",
    "last_seen_at",
    "computed_at",
    "updated_at",
}

# How to call a row in words, in order of preference.
LABEL_COLUMNS = (
    "name",
    "full_name",
    "employee_code",
    "code",
    "title",
    "label",
    "reference",
    "email",
    "period",
    "attendance_date",
)


def label_for(obj) -> str | None:
    for column in LABEL_COLUMNS:
        value = getattr(obj, column, None)
        if value:
            return str(value)[:255]

    # Employees have no single name column on every model.
    first = getattr(obj, "first_name", None)
    last = getattr(obj, "last_name", None)
    if first or last:
        return f"{first or ''} {last or ''}".strip()[:255]
    return None


def plain(value):
    """JSON-safe, and short enough to store."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value[:500] if isinstance(value, str) else value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value][:50]
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in list(value.items())[:50]}
    return str(value)[:500]


def diff(obj, table: str) -> dict:
    """Columns that actually changed, as {field: {from, to}}."""
    state = inspect(obj)
    watched = WATCHED_COLUMNS.get(table)
    changes: dict[str, dict] = {}

    for attr in state.mapper.column_attrs:
        name = attr.key
        if name in SECRET_COLUMNS:
            continue
        if watched is not None and name not in watched:
            continue

        history = state.attrs[name].history
        if not history.has_changes():
            continue

        before = history.deleted[0] if history.deleted else None
        after = history.added[0] if history.added else None
        if before == after:
            continue

        changes[name] = {"from": plain(before), "to": plain(after)}

    return changes


def snapshot(obj, table: str) -> dict:
    state = inspect(obj)
    watched = WATCHED_COLUMNS.get(table)
    out = {}
    for attr in state.mapper.column_attrs:
        if attr.key in SECRET_COLUMNS:
            continue
        if watched is not None and attr.key not in watched:
            continue
        out[attr.key] = plain(getattr(obj, attr.key, None))
    return out


def describe(action: str, table: str, changes: dict) -> str:
    noun = table.replace("_", " ")
    if action == "create":
        return f"Added a {noun}"
    if action == "delete":
        return f"Deleted a {noun}"

    fields = list(changes)
    if not fields:
        return f"Touched a {noun}"
    if len(fields) <= 3:
        return "Changed " + ", ".join(f.replace("_", " ") for f in fields)
    return (
        "Changed "
        + ", ".join(f.replace("_", " ") for f in fields[:3])
        + f" and {len(fields) - 3} more"
    )


# ---------------------------------------------------------------------------
# Writing the trail
# ---------------------------------------------------------------------------


def entry(
    *,
    action: str,
    entity: str,
    entity_id=None,
    label: str | None = None,
    summary: str | None = None,
    changes: dict | None = None,
) -> AuditLog:
    ctx = current()
    return AuditLog(
        admin_id=ctx.admin_id,
        admin_email=ctx.admin_email,
        action=action,
        entity=entity,
        entity_id=None if entity_id is None else str(entity_id)[:64],
        label=label,
        summary=(summary or "")[:500] or None,
        changes=changes or {},
        method=ctx.method,
        path=(ctx.path or "")[:255] or None,
        ip_address=ctx.ip_address,
        user_agent=(ctx.user_agent or "")[:255] or None,
    )


def record(
    db: Session,
    *,
    action: str,
    entity: str,
    entity_id=None,
    label: str | None = None,
    summary: str | None = None,
    changes: dict | None = None,
    commit: bool = True,
) -> None:
    """Log something that is not a row change — a login, a device fetch."""
    if current().muted:
        return

    db.add(
        entry(
            action=action,
            entity=entity,
            entity_id=entity_id,
            label=label,
            summary=summary,
            changes=changes,
        )
    )
    if commit:
        db.commit()


def _collect(session: Session) -> list[AuditLog]:
    """Updates and deletes — both already know their row id."""
    rows: list[AuditLog] = []

    for obj in session.dirty:
        table = obj.__tablename__
        if table in IGNORED_TABLES or not session.is_modified(obj):
            continue
        changes = diff(obj, table)
        if not changes or set(changes) <= HOUSEKEEPING_COLUMNS:
            continue
        rows.append(
            entry(
                action="update",
                entity=table,
                entity_id=getattr(obj, "id", None),
                label=label_for(obj),
                summary=describe("update", table, changes),
                changes=changes,
            )
        )

    for obj in session.deleted:
        table = obj.__tablename__
        if table in IGNORED_TABLES:
            continue
        rows.append(
            entry(
                action="delete",
                entity=table,
                entity_id=getattr(obj, "id", None),
                label=label_for(obj),
                summary=describe("delete", table, {}),
                changes={
                    k: {"from": v, "to": None}
                    for k, v in snapshot(obj, table).items()
                },
            )
        )

    return rows


def _watching() -> bool:
    ctx = current()
    if ctx.muted:
        return False
    # An employee acting on their own records has no admin id, but they are
    # still somebody: the email field carries who they are. Only genuinely
    # unattributed work — seeds, migrations, the scheduler — is skipped.
    return ctx.admin_id is not None or bool(ctx.admin_email)


def install() -> None:
    """Start watching every session opened from here on."""

    @event.listens_for(Session, "before_flush")
    def _before_flush(session, flush_context, instances):  # noqa: ANN001
        if not _watching() or session.info.get("audit_busy"):
            return

        session.info["audit_busy"] = True
        try:
            for row in _collect(session):
                session.add(row)
        finally:
            session.info["audit_busy"] = False

    @event.listens_for(Session, "after_flush")
    def _after_flush(session, flush_context):  # noqa: ANN001
        """Inserts only learn their id once the flush has run."""
        if not _watching() or session.info.get("audit_busy"):
            return

        pending = session.info.setdefault("audit_pending", [])
        for obj in session.new:
            table = getattr(obj, "__tablename__", None)
            if table is None or table in IGNORED_TABLES:
                continue

            values = snapshot(obj, table)
            if WATCHED_COLUMNS.get(table) is not None and not any(values.values()):
                continue

            pending.append(
                entry(
                    action="create",
                    entity=table,
                    entity_id=getattr(obj, "id", None),
                    label=label_for(obj),
                    summary=describe("create", table, {}),
                    changes={k: {"from": None, "to": v} for k, v in values.items()},
                )
            )

    @event.listens_for(Session, "before_commit")
    def _before_commit(session):  # noqa: ANN001
        pending = session.info.get("audit_pending")
        if not pending:
            return

        session.info["audit_pending"] = []
        # Queued only. Flushing here would consume the changes still waiting
        # for the commit's own flush, and that flush is where updates are
        # noticed — they would never reach the trail.
        session.add_all(pending)

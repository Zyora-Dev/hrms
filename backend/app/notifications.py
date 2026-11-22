"""Raising notifications.

Deliberately tiny: anything worth telling someone about calls `notify()` with
enough to render a line and a link. Leaving `employee_id` unset addresses it
to the admin; setting it addresses that one employee.
"""

from sqlalchemy.orm import Session

from app.models import Notification


def notify(
    db: Session,
    *,
    kind: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    entity: str | None = None,
    entity_id: int | None = None,
    actor: str | None = None,
    employee_id: int | None = None,
    commit: bool = False,
) -> Notification:
    row = Notification(
        kind=kind,
        title=title[:160],
        body=(body or "")[:400] or None,
        link=link,
        entity=entity,
        entity_id=entity_id,
        actor=actor,
        employee_id=employee_id,
    )
    db.add(row)
    if commit:
        db.commit()
    return row

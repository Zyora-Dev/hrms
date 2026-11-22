"""Server-sent events for the admin console and the employee portal.

`EventSource` cannot send an Authorization header, so a short-lived ticket is
minted by an authenticated call and handed over in the query string. It is
worth nothing after a minute and opens nothing but this stream.
"""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app import events
from app.config import settings
from app.models import Admin, Employee
from app.routers.auth import current_admin
from app.routers.employee_portal import current_employee

router = APIRouter(prefix="/events", tags=["events"])

TICKET_SECONDS = 60


def mint(subject: str, audience: str) -> str:
    payload = {
        "sub": subject,
        "aud": audience,
        "type": "stream",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(seconds=TICKET_SECONDS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def read_ticket(ticket: str, audience: str) -> str:
    try:
        claims = jwt.decode(
            ticket,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience=audience,
        )
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid ticket") from None

    if claims.get("type") != "stream":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid ticket")
    return str(claims["sub"])


@router.post("/ticket")
def admin_ticket(admin: Admin = Depends(current_admin)):
    return {"ticket": mint(str(admin.id), "admin"), "expires_in": TICKET_SECONDS}


@router.post("/employee-ticket")
def employee_ticket(employee: Employee = Depends(current_employee)):
    return {
        "ticket": mint(str(employee.id), "employee"),
        "expires_in": TICKET_SECONDS,
    }


def sse(topics: set[str], after: int) -> StreamingResponse:
    return StreamingResponse(
        events.stream(topics, after),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Nginx buffers event streams into uselessness without this.
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/admin")
def admin_stream(ticket: str = Query(...), after: int = 0):
    read_ticket(ticket, "admin")
    return sse({"admin"}, after)


@router.get("/employee")
def employee_stream(ticket: str = Query(...), after: int = 0):
    employee_id = read_ticket(ticket, "employee")
    return sse({f"employee:{employee_id}"}, after)


import logging

from fastapi import Depends, FastAPI, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import audit, throttle
from app import scheduler
from app.permissions import permit
from app.config import settings
from app.routers import (
    account,
    advances_router,
    audit_router,
    backups,
    attendance_router,
    auth,
    automations,
    claims_router,
    company,
    dashboard,
    devices,
    documents,
    employee_portal,
    events_router,
    email_router,
    employees,
    expenses,
    holidays_router,
    leave_router,
    letters,
    loans_router,
    lookups,
    notifications_router,
    payroll_router,
    reports,
    settings_router,
    shifts,
    tax_router,
    tds_router,
    team,
)

log = logging.getLogger("hrms.api")

app = FastAPI(title="HRMS API", version="0.1.0")

# Watch every session for changes before any router gets a chance to run.
audit.install()


scheduler.start(app)


# Paths a limiter must not touch: a stream is one long request by design,
# and static files are served by the mount, not the app.
UNLIMITED = ("/events/", "/uploads/", "/docs", "/openapi.json")


@app.middleware("http")
async def rate_limit(request, call_next):
    """Stop any one caller flooding the API.

    Counted per address and per signed-in account rather than per path, so a
    loop spread across several endpoints is still caught.
    """
    path = request.url.path
    if request.method == "OPTIONS" or path.startswith(UNLIMITED):
        return await call_next(request)

    address = request.client.host if request.client else "unknown"
    token = request.headers.get("authorization", "")
    # The tail of the token identifies the session without logging the token.
    key = f"{address}|{token[-12:]}" if token else address

    verdict = throttle.api_allowance(key)
    if not verdict.allowed:
        if throttle.first_warning(key):
            log.warning("rate limit tripped by %s on %s", address, path)
        return JSONResponse(
            {"detail": verdict.reason},
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(verdict.retry_after)},
        )

    return await call_next(request)


@app.middleware("http")
async def audit_context(request, call_next):
    """Carry the caller's details into whatever the request goes on to do."""
    audit.set_request(
        method=request.method,
        path=str(request.url.path),
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_ROOT = settings.upload_dir
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

app.include_router(auth.router)
app.include_router(account.router)
app.include_router(
    backups.router,
    dependencies=[Depends(permit("settings"))],
)
app.include_router(
    team.router,
    dependencies=[Depends(permit("team"))],
)
app.include_router(
    audit_router.router,
    dependencies=[Depends(permit("audit"))],
)
app.include_router(
    automations.router,
    dependencies=[Depends(permit("settings"))],
)
app.include_router(dashboard.router)
app.include_router(
    devices.router,
    dependencies=[Depends(permit("attendance"))],
)
app.include_router(
    company.router,
    dependencies=[Depends(permit("company"))],
)
app.include_router(
    employees.router,
    dependencies=[Depends(permit("employees"))],
)
app.include_router(
    documents.router,
    dependencies=[Depends(permit("employees"))],
)
app.include_router(
    expenses.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    email_router.router,
    dependencies=[Depends(permit("settings"))],
)
app.include_router(employee_portal.router)
app.include_router(events_router.router)
app.include_router(
    claims_router.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    lookups.router,
    dependencies=[Depends(permit("employees"))],
)
app.include_router(notifications_router.router)
app.include_router(
    letters.router,
    dependencies=[Depends(permit("employees"))],
)
app.include_router(
    shifts.router,
    dependencies=[Depends(permit("attendance"))],
)
app.include_router(
    attendance_router.router,
    dependencies=[Depends(permit("attendance"))],
)
app.include_router(
    settings_router.router,
    dependencies=[Depends(permit("settings"))],
)
app.include_router(
    payroll_router.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    reports.router,
    dependencies=[Depends(permit("reports"))],
)
app.include_router(
    leave_router.router,
    dependencies=[Depends(permit("leave"))],
)
app.include_router(
    tds_router.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    loans_router.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    advances_router.router,
    dependencies=[Depends(permit("payroll"))],
)
app.include_router(
    holidays_router.router,
    dependencies=[Depends(permit("attendance"))],
)
app.include_router(
    tax_router.router,
    dependencies=[Depends(permit("payroll"))],
)


@app.get("/health")
def health():
    return {"status": "ok"}

import asyncio
import logging
import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response as StarletteResponse

# Use the standard asyncio event loop policy to avoid uvloop-related SQLAlchemy MissingGreenlet issues.
asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from app.core.config import settings
from app.core.error_handler import register_error_handlers
from app.core.limiter import limiter
from app.core.logging_config import setup_logging
from app.core.observability import init_sentry, install_slow_query_logging, check_database, check_redis, collect_system_info
from app.db.session import engine

_app_started = False
_app_init_error: Optional[str] = None

from app.api.v1 import auth, production, quality, inventory, dispatch, purchase, stores, hr, accounts, maintenance, dashboard, qr_system, reports, users, audit, masters, stock as stock_router, sales as sales_router, lotrac as lotrac_router, payroll as payroll_router, uploads as uploads_router, exports as exports_router, ui_config as ui_config_router, imports as imports_router
from app.api.v1.admin import router as admin_router
from app.api.v1.billing import router as billing_router
from app.api.v1.mill_config import router as mill_config_router
from app.api.v1.mixing import router as mixing_router
from app.api.v1.production_v2 import router as production_v2_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.alerts import router as alerts_router
from app.api.v1.customer_success import router as customer_success_router
from app.api.v1.demo import router as demo_router
from app.ws.notifications import router as ws_router

setup_logging()
init_sentry()
install_slow_query_logging(engine)

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next) -> StarletteResponse:
        response = await call_next(request)
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data:; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Content-Security-Policy"] = csp
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


class CORSEnsureMiddleware:
    """Raw ASGI middleware that ensures CORS headers on every HTTP response.

    Wraps the ASGI ``send`` callback so that *any* response sent by the inner
    app — including error responses produced by FastAPI exception handlers —
    receives the ``Access-Control-Allow-Origin`` header when the request origin
    is allowed.  Acts as a safety net beneath the standard ``CORSMiddleware``.
    """

    def __init__(
        self,
        app,
        allow_origins: Optional[List[str]] = None,
        allow_origin_regex: Optional[str] = None,
        allow_credentials: bool = False,
    ):
        self.app = app
        self.allow_origins = allow_origins or []
        self.allow_origin_regex = re.compile(allow_origin_regex) if allow_origin_regex else None
        self.allow_credentials = allow_credentials

    def is_origin_allowed(self, origin: str) -> bool:
        if origin in self.allow_origins:
            return True
        if self.allow_origin_regex and self.allow_origin_regex.fullmatch(origin):
            return True
        return False

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        origin = None
        for name, value in scope.get("headers", []):
            if name == b"origin":
                origin = value.decode()
                break

        if not origin or not self.is_origin_allowed(origin):
            await self.app(scope, receive, send)
            return

        cors_headers = [
            (b"access-control-allow-origin", origin.encode()),
            (b"vary", b"Origin"),
        ]
        if self.allow_credentials:
            cors_headers.append((b"access-control-allow-credentials", b"true"))

        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                headers = message.get("headers", [])
                has_cors = any(k == b"access-control-allow-origin" for k, _ in headers)
                if not has_cors:
                    message["headers"] = list(headers) + cors_headers
            await send(message)

        await self.app(scope, receive, send_with_cors)


def _run_alembic_upgrade() -> None:
    import sys
    from alembic.config import Config as AlembicConfig
    from alembic import command as alembic_command
    alembic_ini = Path(__file__).parent.parent / "alembic.ini"
    cfg = AlembicConfig(str(alembic_ini))
    try:
        alembic_command.upgrade(cfg, "head")
    except Exception as exc:
        # Print immediately to stderr — guaranteed to appear in Render logs before process exits.
        print(
            f"\n[MIGRATION FATAL] {type(exc).__name__}: {exc}\n"
            f"Fix: check Supabase for NULL mill_id rows or run "
            f"'UPDATE alembic_version SET version_num = <revision>' if schema is already applied.\n",
            file=sys.stderr,
            flush=True,
        )
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Yield immediately so uvicorn binds the port before Render's scan times out.
    All initialization (migrations, seeding, background loops) runs in
    _background_init(). The /api/health endpoint reflects init status."""
    init_task = asyncio.create_task(_background_init())
    yield
    init_task.cancel()
    try:
        await init_task
    except (asyncio.CancelledError, Exception):
        pass
    await engine.dispose()


async def _background_init():
    global _app_started, _app_init_error
    try:
        # ── Step 1: Alembic migration ───────────────────────────────────
        logger.info("START step 1: Alembic migration")
        await asyncio.to_thread(_run_alembic_upgrade)
        logger.info("END step 1: Alembic migration")

        from app.db.session import get_db
        from app.services.pricing_service import PricingService
        from app.services.alert_service import seed_default_rules, seed_escalation_policies
        from app.services.customer_success_service import seed_help_content
        from app.services.demo_service import TourService, NudgeService
        from app.models.masters import Company
        from sqlalchemy import select

        async for session in get_db():
            try:
                # ── Step 2: Seed plans + addons ─────────────────────────
                logger.info("START step 2: Seed plans/addons")
                ps = PricingService(session)
                await ps.seed_default_plans()
                await ps.seed_default_addons()
                logger.info("END step 2: Seed plans/addons")

                # ── Step 3: Seed alert rules ────────────────────────────
                logger.info("START step 3: Seed alert rules/policies")
                n_esc = await seed_escalation_policies(session, company_id=None)
                if n_esc:
                    await session.commit()

                companies = (await session.execute(
                    select(Company).where(Company.status == "active")
                )).scalars().all()
                total_rules = total_esc = 0
                for company in companies:
                    cid = str(company.id)
                    total_rules += await seed_default_rules(session, company_id=cid)
                    total_esc += await seed_escalation_policies(session, company_id=cid)
                if total_rules or total_esc:
                    await session.commit()
                    logger.info("W4B seed: %d rules + %d policies", total_rules, total_esc)
                logger.info("END step 3: Seed alert rules/policies")

                # ── Step 4: Seed help content ──────────────────────────
                logger.info("START step 4: Seed help content")
                n = await seed_help_content(session)
                if n:
                    await session.commit()
                    logger.info("W5.3: seeded %d help articles + categories", n)
                logger.info("END step 4: Seed help content")

                # ── Step 5: Seed tours + nudges ────────────────────────
                logger.info("START step 5: Seed tours/nudges")
                n_tours = await TourService(session).seed_default_tours()
                n_nudges = await NudgeService(session).seed_default_nudges()
                if n_tours or n_nudges:
                    await session.commit()
                    logger.info("W5.4: seeded %d tours + %d nudges", n_tours, n_nudges)
                logger.info("END step 5: Seed tours/nudges")
            except Exception as exc:
                logger.error("Non-fatal seed error (continuing): %s", exc, exc_info=True)
            break

        # ── Step 6: Start background loops ─────────────────────────────
        logger.info("START step 6: Background loops")
        expiry_task = asyncio.create_task(_expiry_loop())
        billing_task = asyncio.create_task(_billing_loop())
        enterprise_task = asyncio.create_task(_enterprise_loop())
        logger.info("END step 6: Background loops (expiry, billing, enterprise)")

        _app_started = True
        logger.info("Application startup complete — all initialization done")
    except Exception as exc:
        _app_init_error = str(exc)
        logger.critical("FATAL: App init failed: %s", exc, exc_info=True)


async def _expiry_loop():
    from app.db.session import get_db
    from app.services.pricing_service import PricingService
    while True:
        try:
            async for session in get_db():
                await PricingService(session).process_expirations()
                await session.commit()
                break
        except Exception as exc:
            logger.error("Expiry check failed: %s", exc, exc_info=True)
        await asyncio.sleep(3600)


async def _billing_loop():
    from app.db.session import get_db
    from datetime import datetime, timezone
    _PS = _OS = _IS = None
    while True:
        now_dt = datetime.now(timezone.utc)
        try:
            async for session in get_db():
                if _PS is None:
                    from app.services.pricing_service import PricingService
                    _PS = PricingService
                    from app.services.overdue_service import OverdueService
                    _OS = OverdueService
                    from app.services.billing_invoice_service import InvoiceService
                    _IS = InvoiceService

                await _PS(session).process_expirations()
                await session.commit()
                await _OS(session).process_overdue_workflow()
                await session.commit()

                if now_dt.day == 1 and now_dt.hour == 2:
                    result = await _IS(session).generate_all_monthly_invoices()
                    await session.commit()
                    if result.get("generated", 0):
                        logger.info("Monthly billing: %d invoices generated", result["generated"])

                await _IS(session).generate_past_due_invoices()
                await session.commit()
                break
        except Exception as exc:
            logger.error("Billing scheduler: %s", exc, exc_info=True)
        await asyncio.sleep(3600)


async def _enterprise_loop():
    from app.db.session import get_db
    alert_interval = 300
    snapshot_interval = 3600
    last_snapshot = 0.0
    while True:
        now = asyncio.get_event_loop().time()
        try:
            async for session in get_db():
                from datetime import datetime as _dt, timedelta as _td
                from sqlalchemy import select as _select, or_ as _or
                from app.models.alerts import AlertEvent, AlertStatus, EscalationPolicy

                overdue = (await session.execute(
                    _select(AlertEvent).where(
                        AlertEvent.status.in_([AlertStatus.OPEN, AlertStatus.ESCALATED]),
                        AlertEvent.next_escalation_at <= _dt.utcnow(),
                        AlertEvent.next_escalation_at.isnot(None),
                    )
                )).scalars().all()

                for event in overdue:
                    next_level = event.escalation_level + 1
                    try:
                        from app.services.notification_service import notify_role
                        policy = (await session.execute(
                            _select(EscalationPolicy).where(
                                EscalationPolicy.category == event.category,
                                EscalationPolicy.severity == event.severity,
                                EscalationPolicy.step == next_level,
                                EscalationPolicy.is_active == True,
                                _or(
                                    EscalationPolicy.company_id == event.company_id,
                                    EscalationPolicy.company_id.is_(None),
                                ),
                            ).order_by(EscalationPolicy.company_id.nulls_last()).limit(1)
                        )).scalar_one_or_none()
                        event.escalation_level = next_level
                        event.status = AlertStatus.ESCALATED
                        if policy:
                            event.next_escalation_at = _dt.utcnow() + _td(minutes=policy.delay_minutes)
                            if event.company_id:
                                await notify_role(
                                    session, company_id=event.company_id,
                                    role_code=policy.target_role,
                                    title=f"[ESCALATED L{next_level}] {event.title}",
                                    message=f"Alert unresolved — escalated to {policy.target_role} (level {next_level}).",
                                    severity=event.severity, category=event.category,
                                    priority="URGENT", source_type="alert_event", source_id=event.id,
                                )
                        else:
                            event.next_escalation_at = None
                    except Exception as ne:
                        logger.debug("Escalation notify failed: %s", ne)
                        event.escalation_level = next_level
                        event.status = AlertStatus.ESCALATED
                        event.next_escalation_at = None
                if overdue:
                    await session.commit()
                    logger.info("Escalated %d overdue alerts", len(overdue))
                break
        except Exception as exc:
            logger.error("Alert eval loop: %s", exc, exc_info=True)

        if now - last_snapshot >= snapshot_interval:
            try:
                async for session in get_db():
                    from app.services.alert_service import take_usage_snapshot, check_and_fire_billing_alerts, check_maintenance_due_alerts
                    n = await take_usage_snapshot(session)
                    logger.info("Usage snapshot taken for %d companies", n)
                    n = await check_and_fire_billing_alerts(session)
                    if n:
                        logger.info("Fired %d billing alerts", n)
                    n = await check_maintenance_due_alerts(session)
                    if n:
                        logger.info("Fired %d maintenance due alerts", n)
                    break
            except Exception as exc:
                logger.error("Hourly jobs failed: %s", exc, exc_info=True)
            last_snapshot = asyncio.get_event_loop().time()

        await asyncio.sleep(alert_interval)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

register_error_handlers(app)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "::1",
        "spinflow.onrender.com",
        "*.onrender.com",
    ],
)

# CORS must be outermost middleware (added last) so it wraps all errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Fallback CORS middleware: ensures CORS headers on every response,
# even when CORSMiddleware does not fire (e.g. early ASGI errors).
app.add_middleware(
    CORSEnsureMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_origin_regex=settings.CORS_ORIGIN_REGEX,
    allow_credentials=True,
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX, tags=["Authentication"])
app.include_router(production.router, prefix=API_PREFIX, tags=["Production"])
app.include_router(quality.router, prefix=API_PREFIX, tags=["Quality"])
app.include_router(inventory.router, prefix=API_PREFIX, tags=["Inventory"])
app.include_router(dispatch.router, prefix=API_PREFIX, tags=["Dispatch"])
app.include_router(purchase.router, prefix=API_PREFIX, tags=["Purchase"])
app.include_router(stores.router, prefix=API_PREFIX, tags=["Stores"])
app.include_router(hr.router, prefix=API_PREFIX, tags=["HR"])
app.include_router(accounts.router, prefix=API_PREFIX, tags=["Accounts"])
app.include_router(maintenance.router, prefix=API_PREFIX, tags=["Maintenance"])
app.include_router(dashboard.router, prefix=API_PREFIX, tags=["Dashboard"])
app.include_router(qr_system.router, prefix=API_PREFIX, tags=["QR System"])
app.include_router(reports.router, prefix=API_PREFIX, tags=["Reports"])
app.include_router(users.router, prefix=API_PREFIX, tags=["Users"])
app.include_router(audit.router, prefix=API_PREFIX, tags=["Audit"])
app.include_router(masters.router, prefix=API_PREFIX, tags=["Masters"])
app.include_router(stock_router.router, prefix=API_PREFIX, tags=["Stock"])
app.include_router(sales_router.router, prefix=API_PREFIX, tags=["Sales"])
app.include_router(lotrac_router.router, prefix=API_PREFIX, tags=["LoTrac"])
app.include_router(payroll_router.router, prefix=API_PREFIX, tags=["Payroll"])
app.include_router(uploads_router.router, prefix=API_PREFIX, tags=["Uploads"])
app.include_router(exports_router.router, prefix=API_PREFIX, tags=["Exports"])
app.include_router(ui_config_router.router, prefix=API_PREFIX, tags=["UI Config"])
app.include_router(imports_router.router, prefix=API_PREFIX, tags=["Imports"])
app.include_router(admin_router, prefix=API_PREFIX, tags=["Admin"])
app.include_router(billing_router, prefix=API_PREFIX, tags=["Billing"])
app.include_router(mill_config_router, prefix=API_PREFIX, tags=["Mill Config"])
app.include_router(mixing_router, prefix=API_PREFIX, tags=["Mixing & JCP"])
app.include_router(production_v2_router, prefix=API_PREFIX, tags=["Production v2"])
app.include_router(notifications_router, prefix=API_PREFIX, tags=["Notifications"])
app.include_router(alerts_router, prefix=API_PREFIX, tags=["Alerts"])
app.include_router(customer_success_router, prefix=API_PREFIX, tags=["Customer Success"])
app.include_router(demo_router, prefix=API_PREFIX, tags=["Demo & Trial"])
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    from fastapi.responses import JSONResponse

    if _app_init_error:
        return JSONResponse(
            content={"status": "unhealthy", "error": _app_init_error,
                     "app": settings.APP_NAME, "version": settings.VERSION,
                     "environment": settings.ENVIRONMENT},
            status_code=503,
        )
    if not _app_started:
        return JSONResponse(
            content={"status": "initializing", "app": settings.APP_NAME,
                     "version": settings.VERSION, "environment": settings.ENVIRONMENT},
            status_code=503,
        )

    db_status = {"status": "not_checked"}
    redis_status = {"status": "not_checked"}
    try:
        from app.db.session import get_db
        async for session in get_db():
            db_status = await check_database(session)
            break
    except Exception as exc:
        db_status = {"status": "unhealthy", "error": str(exc)}
    try:
        redis_status = await check_redis()
    except Exception as exc:
        redis_status = {"status": "unhealthy", "error": str(exc)}
    system = collect_system_info()
    db_healthy = db_status.get("status") == "healthy"
    overall_healthy = db_healthy

    payload = {
        "status": "healthy" if overall_healthy else "unhealthy",
        "app": settings.APP_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "redis": redis_status,
        "system": system,
    }
    http_status = 200 if overall_healthy else 503
    return JSONResponse(content=payload, status_code=http_status)

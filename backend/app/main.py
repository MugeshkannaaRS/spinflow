import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

# Use the standard asyncio event loop policy to avoid uvloop-related SQLAlchemy MissingGreenlet issues.
asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
from slowapi import _rate_limit_exceeded_handler
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from app.core.config import settings
from app.core.error_handler import register_error_handlers
from app.core.limiter import limiter
from app.db.session import engine
from app.db.base import Base
from app.api.v1 import auth, production, quality, inventory, dispatch, purchase, stores, hr, accounts, maintenance, dashboard, qr_system, reports, users, audit, masters, stock as stock_router, sales as sales_router, lotrac as lotrac_router, payroll as payroll_router, uploads as uploads_router, exports as exports_router, ui_config as ui_config_router
from app.api.v1.admin import router as admin_router
from app.ws.notifications import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_origin_regex=r"^https://(.*\.ngrok(?:-free)?\.dev|.*\.onrender\.com)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=[
        "localhost",
        "127.0.0.1",
        "::1",
        "spinflow.local",
        "spinflow.onrender.com",
        "*.spinflow.in",
        "*.onrender.com",
        "*.ngrok.io",
        "*.ngrok-free.dev",
    ],
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
app.include_router(admin_router, prefix=API_PREFIX, tags=["Admin"])
app.include_router(ws_router)


@app.get("/api/health")
async def health():
    return {"status": "healthy", "app": settings.APP_NAME, "version": settings.VERSION}

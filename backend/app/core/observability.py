"""Observability helpers — Sentry, slow query logging, health probes."""

import logging
import time

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import settings

logger = logging.getLogger(__name__)


def init_sentry() -> None:
    """Initialise Sentry SDK if SENTRY_DSN is configured."""
    if not settings.SENTRY_DSN:
        logger.info("Sentry not configured — skipping initialisation")
        return

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.SENTRY_ENVIRONMENT or settings.ENVIRONMENT,
            traces_sample_rate=0.25,
            profiles_sample_rate=0.10,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
            send_default_pii=False,
        )
        logger.info("Sentry initialised", extra={"environment": settings.SENTRY_ENVIRONMENT})
    except Exception as exc:
        logger.warning("Sentry initialisation failed", extra={"error": str(exc)})


def install_slow_query_logging(engine: AsyncEngine) -> None:
    """Install SQLAlchemy event listeners that log queries exceeding SLOW_QUERY_THRESHOLD ms.

    Attach to both ``before_cursor_execute`` and ``after_cursor_execute``
    to measure elapsed time.  Works with both sync and async engines.
    """
    threshold = settings.SLOW_QUERY_THRESHOLD
    if threshold <= 0:
        logger.info("Slow query logging disabled (SLOW_QUERY_THRESHOLD ≤ 0)")
        return

    # Use the sync engine underpinning the async engine
    sync_engine = engine.sync_engine if hasattr(engine, "sync_engine") else engine

    # Store start time per connection on the connection info dict
    @event.listens_for(sync_engine, "before_cursor_execute", named=True)
    def _before_cursor_execute(**kw):
        conn = kw["conn"]
        conn._query_start_time = time.monotonic()

    @event.listens_for(sync_engine, "after_cursor_execute", named=True)
    def _after_cursor_execute(**kw):
        conn = kw["conn"]
        start = getattr(conn, "_query_start_time", None)
        if start is None:
            return
        elapsed_ms = int((time.monotonic() - start) * 1000)
        if elapsed_ms >= threshold:
            statement = kw["statement"]
            truncated = statement[:500] if statement else ""
            logger.warning(
                "Slow query",
                extra={
                    "elapsed_ms": elapsed_ms,
                    "threshold_ms": threshold,
                    "query": truncated,
                    "parameters": str(kw.get("parameters", "")[:200]),
                },
            )

    logger.info(
        "Slow query logging installed",
        extra={"threshold_ms": threshold},
    )


async def check_database(session) -> dict:
    """Return database connectivity status."""
    try:
        from sqlalchemy import text
        await session.execute(text("SELECT 1"))
        return {"status": "healthy"}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


async def check_redis() -> dict:
    """Return Redis connectivity status."""
    if not settings.REDIS_URL:
        return {"status": "not_configured"}
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        return {"status": "healthy"}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)}


def collect_system_info() -> dict:
    """Return basic system metrics."""
    import os, platform
    return {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "hostname": platform.node(),
        "environment": settings.ENVIRONMENT,
        "workers": os.cpu_count() or 1,
    }

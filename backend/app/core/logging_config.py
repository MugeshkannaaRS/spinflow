"""Structured JSON logging configuration.

Usage in any module:
    import logging
    logger = logging.getLogger(__name__)

All loggers inherit the JSON format configured here.
"""

import logging
import sys
from pythonjsonlogger import jsonlogger
from app.core.config import settings


def setup_logging() -> None:
    """Configure root logger with structured JSON output.

    Call once at application startup (main.py lifespan).
    All child loggers (``logging.getLogger(__name__)``) inherit this config.
    """
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    # Remove default handlers to avoid duplicate output
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if settings.LOG_FORMAT == "json":
        fmt = jsonlogger.JsonFormatter(
            fmt="%(asctime)s %(name)s %(levelname)s %(message)s %(module)s %(funcName)s %(lineno)d",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )
    else:
        fmt = logging.Formatter(
            fmt="%(asctime)s [%(levelname)-5s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    handler.setFormatter(fmt)
    root.addHandler(handler)

    # Suppress noisy libs
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)

    # Keep uvicorn access logs at INFO
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    root.info("Logging configured", extra={
        "log_level": settings.LOG_LEVEL,
        "log_format": settings.LOG_FORMAT,
        "environment": settings.ENVIRONMENT,
    })

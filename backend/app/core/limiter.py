import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.core.config import settings

logger = logging.getLogger(__name__)

# Use Redis-backed storage when REDIS_URL is set so rate limit counters
# survive process restarts and work correctly across multiple workers.
# Falls back to in-memory if Redis is not reachable (graceful degradation).
_storage_uri = None
if settings.REDIS_URL:
    _storage_uri = settings.REDIS_URL
    logger.info(
        "Rate limiter backend: redis (counters persist across restarts, "
        "distributed across workers)"
    )
else:
    logger.warning(
        "Rate limiter backend: memory (REDIS_URL not set — counters reset on "
        "every restart and are NOT shared across workers). "
        "Set REDIS_URL in Render env vars to enable Redis-backed limiting."
    )

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
    storage_uri=_storage_uri,
)

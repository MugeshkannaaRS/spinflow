import logging
from slowapi import Limiter
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

def _real_client_ip(request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


limiter = Limiter(
    key_func=_real_client_ip,
    default_limits=[f"{settings.RATE_LIMIT_PER_MINUTE}/minute"],
    storage_uri=_storage_uri,
    swallow_errors=True,
    in_memory_fallback_enabled=True,
)

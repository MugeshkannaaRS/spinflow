from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings


DEFAULT_CORS_ORIGINS = ",".join(
    [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        # Known Render production origins. These keep the hosted app usable if
        # Render env vars are missing or the service starts from backend/.env.
        "https://spinflow-f.onrender.com",
        "https://spinflow.onrender.com",
    ]
)


class Settings(BaseSettings):
    APP_NAME: str = "SpinFlow ERP"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def parse_debug(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production"}:
                return False
        return value

    # Database — no defaults; must be set via .env or env vars
    DATABASE_URL: str = ""
    DATABASE_SYNC_URL: str = ""

    # JWT — no defaults; must be set via .env or env vars
    SECRET_KEY: str = ""
    REFRESH_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS512"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis — no default
    REDIS_URL: str = ""

    # CORS — explicit origins only.
    # CORS_ORIGIN_REGEX is restricted to ngrok dev tunnels only.
    # Production Render domains must be listed explicitly in CORS_ORIGINS (set via env var).
    # Defaults include local development and the known Render production deployment.
    CORS_ORIGINS: str = DEFAULT_CORS_ORIGINS
    CORS_ORIGIN_REGEX: str = ""

    @property
    def parsed_cors_origins(self) -> List[str]:
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip() and "*" not in item]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # Empty means auto:
    # - DEBUG=true: lax for local HTTP development
    # - DEBUG=false: none so Render frontend/backend cross-site refresh works
    REFRESH_COOKIE_SAMESITE: str = ""

    @property
    def refresh_cookie_samesite(self) -> str:
        value = self.REFRESH_COOKIE_SAMESITE.strip().lower()
        if value:
            if value not in {"strict", "lax", "none"}:
                raise RuntimeError(
                    "REFRESH_COOKIE_SAMESITE must be one of: strict, lax, none"
                )
            return value
        return "lax" if self.DEBUG else "none"

    # QR — no default
    QR_SECRET_KEY: str = ""

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # Observability
    SENTRY_DSN: str = ""
    SENTRY_ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "json"
    SLOW_QUERY_THRESHOLD: int = 500
    ENVIRONMENT: str = "development"

    # SMTP
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_NAME: str = "SpinFlow ERP"

    class Config:
        env_file = ".env"
        case_sensitive = True

    def check_secrets(self):
        required = {
            "DATABASE_URL": self.DATABASE_URL,
            "SECRET_KEY": self.SECRET_KEY,
            "REFRESH_SECRET_KEY": self.REFRESH_SECRET_KEY,
            "REDIS_URL": self.REDIS_URL,
            "QR_SECRET_KEY": self.QR_SECRET_KEY,
            # Payment gateway — integrate later
            # "RAZORPAY_WEBHOOK_SECRET": self.RAZORPAY_WEBHOOK_SECRET,
        }
        missing = [name for name, val in required.items() if not val]
        if missing:
            raise RuntimeError(
                f"CRITICAL: Missing required environment variables: {', '.join(missing)}. "
                "Set them in .env or the environment before starting."
            )
        if len(self.SECRET_KEY) < 32:
            raise RuntimeError(
                f"SECRET_KEY must be at least 32 characters (got {len(self.SECRET_KEY)}). "
                "Generate a strong key with: python -c \"import secrets; print(secrets.token_hex(32))\""
            )
        if self.SENTRY_DSN and not self.SENTRY_DSN.startswith("https://"):
            logger = __import__("logging").getLogger("spinflow")
            logger.warning("SENTRY_DSN does not look like a valid DSN (expected https://...)")


settings = Settings()
settings.check_secrets()

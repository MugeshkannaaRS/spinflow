import json
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings
import os
import secrets


class Settings(BaseSettings):
    APP_NAME: str = "SpinFlow ERP"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

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

    # CORS — explicit origins only (no glob/wildcard), wildcard subdomains go in CORS_ORIGIN_REGEX
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173"
    CORS_ORIGIN_REGEX: str = r"^https://(.*\.ngrok(?:-free)?\.dev|.*\.onrender\.com)$"

    @property
    def parsed_cors_origins(self) -> List[str]:
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip() and "*" not in item]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # QR — no default
    QR_SECRET_KEY: str = ""

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


settings = Settings()
settings.check_secrets()

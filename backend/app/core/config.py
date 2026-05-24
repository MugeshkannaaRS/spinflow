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

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://spinflow:X7k9mP2qR5vB8wN1fL4jH6cY3aE0gT8uWxZ@localhost:5432/spinflow_db"
    DATABASE_SYNC_URL: str = "postgresql://spinflow:X7k9mP2qR5vB8wN1fL4jH6cY3aE0gT8uWxZ@localhost:5432/spinflow_db"

    # JWT — 64-char hex secrets
    SECRET_KEY: str = "3b14cff4f6ce9e395b89e738a277c30e4bb692824c1a63657c4a5eadad78bf41"
    REFRESH_SECRET_KEY: str = "e76756cc9ab58da55e48df07667f00c9ed86a386ce6509e734bf09739afea9c3"
    JWT_ALGORITHM: str = "HS512"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Redis
    REDIS_URL: str = "redis://:X8kLm9pQ4rT2vB6nW1cY3zA7eR5fH0jG@localhost:6379/0"

    # CORS — production only, no wildcard; allow local dev and ngrok during development
    CORS_ORIGINS: str = "https://spinflow.onrender.com,https://spinflow-f.onrender.com,http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,https://*.ngrok.io,https://*.ngrok-free.dev"

    @property
    def parsed_cors_origins(self) -> List[str]:
        return [item.strip() for item in self.CORS_ORIGINS.split(",") if item.strip()]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # QR
    QR_SECRET_KEY: str = "4d8f1c2e9a7b3d5f6c0e8a2b4d1f7c9e0a3b5d8f"

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
        if "change-this" in self.SECRET_KEY or "change" in self.SECRET_KEY or len(self.SECRET_KEY) < 32:
            import warnings
            warnings.warn(
                "WARNING: SECRET_KEY is insecure or too short. Generate a strong key with: "
                "python -c \"import secrets; print(secrets.token_hex(32))\""
            )


settings = Settings()
settings.check_secrets()

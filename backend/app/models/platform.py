"""Wave 5 — Platform-level tracking models (storage, API usage)."""
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


class StorageUsage(TimestampMixin, Base):
    """Tracks storage consumption per company."""
    __tablename__ = "storage_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    upload_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    db_estimate_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class ApiUsage(TimestampMixin, Base):
    """Tracks API call volume per company."""
    __tablename__ = "api_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    method: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

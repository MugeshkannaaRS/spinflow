from sqlalchemy import String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


# ---------------------------------------------------------------------------
# Category + Severity constants (imported by log_audit helper)
# ---------------------------------------------------------------------------

class LogCategory:
    SECURITY      = "SECURITY"
    USER_ACTIVITY = "USER_ACTIVITY"
    PRODUCTION    = "PRODUCTION"
    INVENTORY     = "INVENTORY"
    HR            = "HR"
    PAYROLL       = "PAYROLL"
    PURCHASE      = "PURCHASE"
    SALES         = "SALES"
    BILLING       = "BILLING"
    SYSTEM        = "SYSTEM"


class LogSeverity:
    INFO      = "INFO"
    WARNING   = "WARNING"
    CRITICAL  = "CRITICAL"
    EMERGENCY = "EMERGENCY"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    # ── Original columns (unchanged) ────────────────────────────────────
    id:         Mapped[str]           = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id:    Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    user_name:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    role:       Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    action:     Mapped[str]           = mapped_column(String(50),  nullable=False, index=True)
    entity:     Mapped[str]           = mapped_column(String(100), nullable=False, index=True)
    entity_id:  Mapped[Optional[str]] = mapped_column(String(36),  nullable=True)
    details:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    old_value:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    new_value:  Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    created_at: Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    # ── Wave 4A additions ────────────────────────────────────────────────
    category:      Mapped[Optional[str]] = mapped_column(String(50),  nullable=True, index=True)
    severity:      Mapped[Optional[str]] = mapped_column(String(20),  nullable=True, index=True)
    entity_name:   Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    mill_name:     Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    company_name:  Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    company_id:    Mapped[Optional[str]] = mapped_column(String(36),  nullable=True, index=True)
    mill_id:       Mapped[Optional[str]] = mapped_column(String(36),  nullable=True, index=True)
    module:        Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSONB,      nullable=True)
    archived_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by:    Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

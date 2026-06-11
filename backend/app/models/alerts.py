"""Models for Wave 4A enterprise alert + notification foundation.

Tables: notifications, alert_rules, alert_events,
        alert_acknowledgements, escalation_policies, usage_snapshots
"""

from sqlalchemy import (
    String, Integer, Boolean, DateTime, ForeignKey,
    Text, Numeric, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date as date_type
from typing import Optional
from app.db.base import Base, generate_uuid


# ---------------------------------------------------------------------------
# Enums (plain strings — no SA Enum so migrations stay simple)
# ---------------------------------------------------------------------------

class AlertCategory:
    MACHINE   = "MACHINE"
    SECURITY  = "SECURITY"
    HR        = "HR"
    BILLING   = "BILLING"
    INVENTORY = "INVENTORY"
    SYSTEM    = "SYSTEM"

class AlertSeverity:
    INFO      = "INFO"
    WARNING   = "WARNING"
    CRITICAL  = "CRITICAL"
    EMERGENCY = "EMERGENCY"

class AlertStatus:
    OPEN         = "OPEN"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    ESCALATED    = "ESCALATED"
    RESOLVED     = "RESOLVED"

class NotificationPriority:
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"
    URGENT = "URGENT"


# ---------------------------------------------------------------------------
# Notification
# ---------------------------------------------------------------------------

class Notification(Base):
    """DB-persisted in-app notifications for a specific user."""
    __tablename__ = "notifications"

    id:          Mapped[str]           = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:  Mapped[str]           = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    mill_id:     Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id",     ondelete="SET NULL"), nullable=True)
    user_id:     Mapped[str]           = mapped_column(String(36), ForeignKey("users.id",     ondelete="CASCADE"), nullable=False, index=True)
    title:       Mapped[str]           = mapped_column(String(200), nullable=False)
    message:     Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    severity:    Mapped[str]           = mapped_column(String(20), default="INFO",   nullable=False)
    category:    Mapped[str]           = mapped_column(String(50), default="SYSTEM", nullable=False)
    icon:        Mapped[Optional[str]] = mapped_column(String(50),  nullable=True)
    action_url:  Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    priority:    Mapped[str]           = mapped_column(String(20), default="MEDIUM", nullable=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_id:   Mapped[Optional[str]] = mapped_column(String(36),  nullable=True)
    is_read:     Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool]          = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, default=dict, nullable=True)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at:     Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# AlertRule
# ---------------------------------------------------------------------------

class AlertRule(Base):
    """Defines when an alert should fire. company_id=NULL means global/system rule."""
    __tablename__ = "alert_rules"

    id:               Mapped[str]             = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:       Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    mill_id:          Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("mills.id",     ondelete="SET NULL"), nullable=True)
    name:             Mapped[str]             = mapped_column(String(200), nullable=False)
    description:      Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    category:         Mapped[str]             = mapped_column(String(50),  nullable=False)
    condition_type:   Mapped[str]             = mapped_column(String(100), nullable=False, index=True)
    threshold_value:  Mapped[Optional[float]] = mapped_column(Numeric(12, 4), nullable=True)
    threshold_unit:   Mapped[Optional[str]]   = mapped_column(String(50),  nullable=True)
    severity:         Mapped[str]             = mapped_column(String(20), default="WARNING", nullable=False)
    target_roles:     Mapped[Optional[dict]]  = mapped_column(JSONB, default=list, nullable=True)
    is_active:        Mapped[bool]            = mapped_column(Boolean, default=True,  nullable=False)
    is_system:        Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)
    cooldown_minutes: Mapped[int]             = mapped_column(Integer, default=60, nullable=False)
    created_at:       Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:       Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    events = relationship("AlertEvent", back_populates="rule", lazy="dynamic")


# ---------------------------------------------------------------------------
# AlertEvent
# ---------------------------------------------------------------------------

class AlertEvent(Base):
    """A single fired alert instance, with lifecycle (OPEN → ACK → RESOLVED)."""
    __tablename__ = "alert_events"

    id:                 Mapped[str]             = mapped_column(String(36), primary_key=True, default=generate_uuid)
    rule_id:            Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("alert_rules.id", ondelete="SET NULL"), nullable=True)
    company_id:         Mapped[str]             = mapped_column(String(36), ForeignKey("companies.id",  ondelete="CASCADE"), nullable=False, index=True)
    mill_id:            Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("mills.id",      ondelete="SET NULL"), nullable=True)
    source_type:        Mapped[Optional[str]]   = mapped_column(String(100), nullable=True)
    source_id:          Mapped[Optional[str]]   = mapped_column(String(36),  nullable=True)
    source_data:        Mapped[Optional[dict]]  = mapped_column(JSONB, default=dict, nullable=True)
    title:              Mapped[str]             = mapped_column(String(200), nullable=False)
    message:            Mapped[Optional[str]]   = mapped_column(Text, nullable=True)
    severity:           Mapped[str]             = mapped_column(String(20), default="WARNING", nullable=False)
    category:           Mapped[str]             = mapped_column(String(50), nullable=False)
    status:             Mapped[str]             = mapped_column(String(20), default="OPEN", nullable=False)
    target_role:        Mapped[Optional[str]]   = mapped_column(String(50), nullable=True)
    acknowledged_by:    Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    acknowledged_at:    Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_by:        Mapped[Optional[str]]   = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at:        Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    escalation_level:   Mapped[int]             = mapped_column(Integer, default=0, nullable=False)
    next_escalation_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:         Mapped[datetime]        = mapped_column(DateTime(timezone=True), server_default=func.now())

    rule = relationship("AlertRule", back_populates="events", lazy="select")
    acknowledgements = relationship("AlertAcknowledgement", back_populates="event", lazy="dynamic")


# ---------------------------------------------------------------------------
# AlertAcknowledgement
# ---------------------------------------------------------------------------

class AlertAcknowledgement(Base):
    """Audit trail for every action taken on an AlertEvent."""
    __tablename__ = "alert_acknowledgements"

    id:             Mapped[str]           = mapped_column(String(36), primary_key=True, default=generate_uuid)
    alert_event_id: Mapped[str]           = mapped_column(String(36), ForeignKey("alert_events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:        Mapped[str]           = mapped_column(String(36), ForeignKey("users.id",        ondelete="CASCADE"), nullable=False)
    action:         Mapped[str]           = mapped_column(String(30), default="ACKNOWLEDGED", nullable=False)
    notes:          Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at:     Mapped[datetime]      = mapped_column(DateTime(timezone=True), server_default=func.now())

    event = relationship("AlertEvent", back_populates="acknowledgements")


# ---------------------------------------------------------------------------
# EscalationPolicy
# ---------------------------------------------------------------------------

class EscalationPolicy(Base):
    """Defines who to notify at each escalation step, and after how long."""
    __tablename__ = "escalation_policies"

    id:            Mapped[str]           = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:    Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)
    category:      Mapped[str]           = mapped_column(String(50), nullable=False)
    severity:      Mapped[str]           = mapped_column(String(20), nullable=False)
    step:          Mapped[int]           = mapped_column(Integer, nullable=False)
    target_role:   Mapped[str]           = mapped_column(String(50), nullable=False)
    delay_minutes: Mapped[int]           = mapped_column(Integer, default=30, nullable=False)
    is_active:     Mapped[bool]          = mapped_column(Boolean, default=True, nullable=False)


# ---------------------------------------------------------------------------
# UsageSnapshot
# ---------------------------------------------------------------------------

class UsageSnapshot(Base):
    """Daily usage metrics per company for billing enforcement."""
    __tablename__ = "usage_snapshots"

    id:              Mapped[str]      = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:      Mapped[str]      = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    snapshot_date:   Mapped[date_type] = mapped_column(DateTime(timezone=False), nullable=False)
    active_users:    Mapped[int]      = mapped_column(Integer, default=0)
    total_employees: Mapped[int]      = mapped_column(Integer, default=0)
    total_machines:  Mapped[int]      = mapped_column(Integer, default=0)
    total_mills:     Mapped[int]      = mapped_column(Integer, default=0)
    imports_count:   Mapped[int]      = mapped_column(Integer, default=0)
    exports_count:   Mapped[int]      = mapped_column(Integer, default=0)
    created_at:      Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "snapshot_date", name="uq_usage_snapshot_company_date"),
    )

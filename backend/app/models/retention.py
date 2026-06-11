"""Wave 5 — Audit Retention & Backup/DR models."""
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Text, JSON, BigInteger, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


# ═══════════════════════════════════════════════════════════════════
# Phase 5 — Data Retention
# ═══════════════════════════════════════════════════════════════════


class RetentionPolicy(TimestampMixin, Base):
    """Configurable retention rules per entity/severity."""
    __tablename__ = "retention_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    """'audit_log', 'notification', 'alert_event', etc."""
    severity: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    retention_days: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(String(20), default="archive")
    """'archive', 'delete', 'purge'"""
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


# ═══════════════════════════════════════════════════════════════════
# Phase 6 — Backup & Disaster Recovery
# ═══════════════════════════════════════════════════════════════════


class BackupJob(TimestampMixin, Base):
    """Record of a backup operation."""
    __tablename__ = "backup_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)
    backup_type: Mapped[str] = mapped_column(String(20), default="full")
    """full, incremental, audit_only, company"""
    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending, running, completed, failed"""
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    rows_backed_up: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checksum: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


class BackupRestore(TimestampMixin, Base):
    """Record of a restore operation from a backup."""
    __tablename__ = "backup_restores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    backup_job_id: Mapped[str] = mapped_column(String(36), ForeignKey("backup_jobs.id", ondelete="SET NULL"), nullable=False, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending, running, completed, failed, dry_run"""
    tables_restored: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rows_restored: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_dry_run: Mapped[bool] = mapped_column(Boolean, default=False)
    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


# ═══════════════════════════════════════════════════════════════════
# Phase 9 — Platform Health
# ═══════════════════════════════════════════════════════════════════


class HealthCheckResult(TimestampMixin, Base):
    """Timeline of platform health check results."""
    __tablename__ = "health_check_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    component: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    """database, redis, websocket, billing, storage, background_jobs"""
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    """healthy, warning, critical"""
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Incident(TimestampMixin, Base):
    """Tracked platform incidents."""
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    component: Mapped[str] = mapped_column(String(50), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    """critical, major, minor, warning"""
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    """open, investigating, resolved, closed"""
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reported_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)

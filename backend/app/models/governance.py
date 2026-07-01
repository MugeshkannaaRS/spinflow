"""Wave 5 — Governance Platform models.

PermissionSet, SecurityPolicy, CompanyBranding, ApprovalWorkflow (Phase 4).
"""
from sqlalchemy import String, Integer, Boolean, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


# ═══════════════════════════════════════════════════════════════════
# Phase 3 — Governance Platform
# ═══════════════════════════════════════════════════════════════════


class PermissionSet(TimestampMixin, Base):
    """Named group of module access levels, reusable across roles."""
    __tablename__ = "permission_sets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    permissions: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    """Format: {"module_code": "read"|"write"|"none", ...}"""
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


class SecurityPolicy(TimestampMixin, Base):
    """Per-company security settings."""
    __tablename__ = "security_policies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    min_password_length: Mapped[int] = mapped_column(Integer, default=8)
    require_mfa: Mapped[bool] = mapped_column(Boolean, default=False)
    session_timeout_minutes: Mapped[int] = mapped_column(Integer, default=480)
    max_failed_logins: Mapped[int] = mapped_column(Integer, default=5)
    ip_whitelist: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    allowed_domains: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    password_expiry_days: Mapped[int] = mapped_column(Integer, default=90)
    require_special_char: Mapped[bool] = mapped_column(Boolean, default=True)
    require_upper_lower: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


class CompanyBranding(TimestampMixin, Base):
    """Branding configuration per company."""
    __tablename__ = "company_branding"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    primary_color: Mapped[str] = mapped_column(String(7), default="#0f1923")
    secondary_color: Mapped[str] = mapped_column(String(7), default="#0d9488")
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    custom_domain: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    email_header_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    email_footer_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)


# ═══════════════════════════════════════════════════════════════════
# Phase 4 — Universal Approval Engine
# ═══════════════════════════════════════════════════════════════════


class ApprovalWorkflow(TimestampMixin, Base):
    """Defines an approval workflow type (e.g. Purchase Order, Leave, etc.)."""
    __tablename__ = "approval_workflows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    """e.g. 'purchase_order', 'leave', 'payroll', 'budget', 'vendor', 'asset'"""
    module: Mapped[str] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    steps = relationship("ApprovalStep", back_populates="workflow", cascade="all, delete-orphan",
                         order_by="ApprovalStep.step_order")


class ApprovalStep(TimestampMixin, Base):
    """A single step in an approval chain."""
    __tablename__ = "approval_steps"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("approval_workflows.id", ondelete="CASCADE"), nullable=False, index=True)
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(200), default="Approve")
    assignee_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """Role code that can action this step (e.g. GENERAL_MANAGER)."""
    assignee_user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    timeout_hours: Mapped[int] = mapped_column(Integer, default=48)
    escalation_role: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    """If timed out, escalate to this role."""
    action_if_timeout: Mapped[str] = mapped_column(String(20), default="escalate")
    """'escalate', 'auto_approve', 'auto_reject'"""

    workflow = relationship("ApprovalWorkflow", back_populates="steps")


class ApprovalRequest(TimestampMixin, Base):
    """An active/pending approval request for a specific entity."""
    __tablename__ = "approval_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    workflow_id: Mapped[str] = mapped_column(String(36), ForeignKey("approval_workflows.id"), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    entity_summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    """pending, approved, rejected, cancelled"""
    current_step_index: Mapped[int] = mapped_column(Integer, default=0)
    metadata_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)

    workflow = relationship("ApprovalWorkflow")
    actions = relationship("ApprovalAction", back_populates="request", cascade="all, delete-orphan",
                           order_by="ApprovalAction.step_index")


class ApprovalAction(TimestampMixin, Base):
    """Record of each action taken during an approval process."""
    __tablename__ = "approval_actions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    request_id: Mapped[str] = mapped_column(String(36), ForeignKey("approval_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    step_index: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    """approve, reject, escalate"""
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    request = relationship("ApprovalRequest", back_populates="actions")

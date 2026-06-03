from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, JSON, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from typing import Optional, List
from app.db.base import Base, TimestampMixin, generate_uuid


class SubscriptionPlan(TimestampMixin, Base):
    __tablename__ = "subscription_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    monthly_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    yearly_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    included_mills: Mapped[int] = mapped_column(Integer, default=1)
    included_users: Mapped[int] = mapped_column(Integer, default=25)
    additional_mill_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    additional_user_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    module_prices = relationship("ModulePricing", back_populates="plan", cascade="all, delete-orphan")


class ModulePricing(TimestampMixin, Base):
    __tablename__ = "module_pricing"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscription_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    module_name: Mapped[str] = mapped_column(String(100), nullable=False)
    monthly_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    yearly_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    is_included: Mapped[bool] = mapped_column(Boolean, default=False)

    plan = relationship("SubscriptionPlan", back_populates="module_prices")


class CompanySubscription(TimestampMixin, Base):
    __tablename__ = "company_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscription_plans.id"), nullable=False)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="monthly")
    status: Mapped[str] = mapped_column(String(20), default="active")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    addon_modules: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    extra_mills: Mapped[int] = mapped_column(Integer, default=0)
    extra_users: Mapped[int] = mapped_column(Integer, default=0)

class BillingInvoice(TimestampMixin, Base):
    __tablename__ = "billing_invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    company_subscription_id: Mapped[str] = mapped_column(String(36), ForeignKey("company_subscriptions.id"), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    billing_period_start: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    billing_period_end: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    transaction_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gateway: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    pdf_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    line_items: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    invoice_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)


class SubscriptionChangeRequest(TimestampMixin, Base):
    __tablename__ = "subscription_change_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    current_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscription_plans.id"), nullable=False)
    requested_plan_id: Mapped[str] = mapped_column(String(36), ForeignKey("subscription_plans.id"), nullable=False)
    change_type: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    request_metadata: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)

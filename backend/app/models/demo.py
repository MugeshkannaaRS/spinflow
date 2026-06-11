"""Wave 5.4 — Demo Platform + Trial Models

Tables:
  demo_environments  — tracks per-company demo status and expiry
  product_tours      — guided walkthrough step definitions
  tour_progress      — per-user tour completion tracking
  nudges             — contextual recommendation definitions
"""
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


class DemoEnvironment(Base):
    __tablename__ = "demo_environments"

    id:           Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:   Mapped[str]    = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    status:       Mapped[str]    = mapped_column(String(20), default="active", nullable=False)
    source:       Mapped[str]    = mapped_column(String(20), default="self_service")
    created_by:   Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"))
    expires_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    reset_count:  Mapped[int]    = mapped_column(Integer, default=0)
    metadata:     Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProductTour(Base):
    __tablename__ = "product_tours"

    id:           Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title:        Mapped[str]    = mapped_column(String(200), nullable=False)
    slug:         Mapped[str]    = mapped_column(String(100), nullable=False, unique=True)
    description:  Mapped[Optional[str]] = mapped_column(Text)
    target_page:  Mapped[str]    = mapped_column(String(100), nullable=False)
    steps:        Mapped[dict]   = mapped_column(JSONB, nullable=False)
    sort_order:   Mapped[int]    = mapped_column(Integer, default=0)
    is_active:    Mapped[bool]   = mapped_column(Boolean, default=True, nullable=False)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TourProgress(Base):
    __tablename__ = "tour_progress"

    id:           Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id:      Mapped[str]    = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tour_id:      Mapped[str]    = mapped_column(String(36), ForeignKey("product_tours.id", ondelete="CASCADE"), nullable=False)
    current_step: Mapped[int]    = mapped_column(Integer, default=0)
    completed:    Mapped[bool]   = mapped_column(Boolean, default=False, nullable=False)
    skipped:      Mapped[bool]   = mapped_column(Boolean, default=False, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Nudge(Base):
    __tablename__ = "nudges"

    id:           Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    title:        Mapped[str]    = mapped_column(String(200), nullable=False)
    message:      Mapped[str]    = mapped_column(Text, nullable=False)
    nudge_type:   Mapped[str]    = mapped_column(String(50), nullable=False)
    condition:    Mapped[Optional[str]] = mapped_column(String(100))
    action_label: Mapped[Optional[str]] = mapped_column(String(100))
    action_url:   Mapped[Optional[str]] = mapped_column(String(500))
    icon:         Mapped[Optional[str]] = mapped_column(String(50))
    priority:     Mapped[str]    = mapped_column(String(20), default="info")
    is_system:    Mapped[bool]   = mapped_column(Boolean, default=False, nullable=False)
    is_active:    Mapped[bool]   = mapped_column(Boolean, default=True, nullable=False)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

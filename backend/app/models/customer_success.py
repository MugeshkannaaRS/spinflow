"""Customer Success Layer — Wave 5.3

Models:
  SetupProgress — per-company onboarding progress tracker
  HelpCategory  — grouped help articles
  HelpArticle   — knowledge base articles (system + custom)
"""
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


class SetupProgress(Base):
    """Tracks onboarding completion per company. Auto-detected, not user-checked."""
    __tablename__ = "setup_progress"

    id:          Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id:  Mapped[str]    = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    step_data:   Mapped[dict]   = mapped_column(JSONB, default=dict, nullable=False)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", name="uq_setup_progress_company"),
    )


class HelpCategory(Base):
    __tablename__ = "help_categories"

    id:          Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name:        Mapped[str]    = mapped_column(String(100), nullable=False)
    slug:        Mapped[str]    = mapped_column(String(100), nullable=False, unique=True)
    icon:        Mapped[Optional[str]] = mapped_column(String(50))
    sort_order:  Mapped[int]    = mapped_column(Integer, default=0)
    is_active:   Mapped[bool]   = mapped_column(Boolean, default=True, nullable=False)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HelpArticle(Base):
    __tablename__ = "help_articles"

    id:           Mapped[str]    = mapped_column(String(36), primary_key=True, default=generate_uuid)
    category_id:  Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("help_categories.id", ondelete="SET NULL"))
    title:        Mapped[str]    = mapped_column(String(200), nullable=False)
    slug:         Mapped[str]    = mapped_column(String(200), nullable=False, unique=True)
    summary:      Mapped[Optional[str]] = mapped_column(String(500))
    content:      Mapped[str]    = mapped_column(Text, nullable=False)
    content_type: Mapped[str]    = mapped_column(String(20), default="markdown")
    tags:         Mapped[Optional[dict]] = mapped_column(JSONB, default=list)
    context_page: Mapped[Optional[str]] = mapped_column(String(100))
    video_url:    Mapped[Optional[str]] = mapped_column(String(500))
    sort_order:   Mapped[int]    = mapped_column(Integer, default=0)
    is_system:    Mapped[bool]   = mapped_column(Boolean, default=False, nullable=False)
    is_active:    Mapped[bool]   = mapped_column(Boolean, default=True, nullable=False)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

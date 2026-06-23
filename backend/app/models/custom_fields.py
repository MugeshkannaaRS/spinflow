"""
Custom Field Definitions — per-mill extra fields on any entry form.
Zero impact on existing mills: all JSONB columns default to '{}'.
"""
from __future__ import annotations
from typing import Optional
from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, UniqueConstraint, Index, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.base import Base, generate_uuid


class CustomFieldDefinition(Base):
    __tablename__ = "custom_field_definitions"

    __table_args__ = (
        UniqueConstraint("mill_id", "table_name", "field_key", name="uq_custom_field_mill_table_key"),
        Index("ix_custom_field_mill_table", "mill_id", "table_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False)  # text|number|select|boolean|date
    options: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)   # list of strings for select
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

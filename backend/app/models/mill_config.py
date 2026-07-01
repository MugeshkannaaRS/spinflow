from sqlalchemy import String, Boolean, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


class MillMaster(Base):
    """Stores all dynamic master values per mill — departments, grades, shifts, etc."""
    __tablename__ = "mill_masters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    source: Mapped[str] = mapped_column(String(20), default="import")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")


class MillCustomField(Base):
    """Custom fields detected from imports for each module."""
    __tablename__ = "mill_custom_fields"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    field_label: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[str] = mapped_column(String(30), default="text")
    dropdown_values: Mapped[Optional[list]] = mapped_column(JSON, default=list)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    sequence: Mapped[int] = mapped_column(Integer, default=0)
    source: Mapped[str] = mapped_column(String(20), default="import")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")


class MillRecordValue(Base):
    """Custom field values for individual records (employees, machines, etc.)."""
    __tablename__ = "mill_record_values"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    record_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    field_key: Mapped[str] = mapped_column(String(100), nullable=False)
    value_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    value_number: Mapped[Optional[float]] = mapped_column(nullable=True)
    value_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")


class MillConfigProfile(Base):
    """Per-mill configuration profile — field labels, dropdown overrides, and locale."""
    __tablename__ = "mill_configuration_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    field_labels: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    dropdown_options: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()", onupdate="now()")


class NumberingSequence(Base):
    """Per-mill, per-document-type sequence counter."""
    __tablename__ = "numbering_sequences"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    prefix: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    seq: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default="now()", onupdate="now()")

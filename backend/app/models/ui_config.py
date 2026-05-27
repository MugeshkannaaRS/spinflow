from sqlalchemy import String, Text, DateTime, func, Boolean, Numeric, Integer
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, generate_uuid


class ColumnConfig(Base):
    __tablename__ = "column_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    table_key: Mapped[str] = mapped_column(String(50), nullable=False)
    columns: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    placeholder_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    help_text: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    validation_regex: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    min_value: Mapped[Optional[float]] = mapped_column(Numeric(), nullable=True)
    max_value: Mapped[Optional[float]] = mapped_column(Numeric(), nullable=True)
    default_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    group_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_searchable: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    is_sortable: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    is_exportable: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    is_importable: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class ColumnDropdownOption(Base):
    __tablename__ = "column_dropdown_options"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), nullable=False)
    column_key: Mapped[str] = mapped_column(String(100), nullable=False)
    table_name: Mapped[str] = mapped_column(String(100), nullable=False)
    option_value: Mapped[str] = mapped_column(String(200), nullable=False)
    option_label: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, default=True)
    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

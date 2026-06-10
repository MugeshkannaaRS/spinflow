"""
Production v2 models: DatalogStopCode, WasteEntry, RFManpowerPlan, MixingChangeFibreRow
Added in migration 020.
"""
from sqlalchemy import (
    String, Float, Integer, Boolean, DateTime, ForeignKey,
    Text, Time, UniqueConstraint, func, Numeric
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, time
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


class DatalogStopCode(Base):
    """Master lookup table for all 41 DATALOG numeric stop codes."""
    __tablename__ = "datalog_stop_codes"

    code: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # null = applies to all departments; ["spinning","simplex"] = dept-specific
    departments: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # breakdown_electrical | breakdown_mechanical | planned | utility | production_change | quality
    category: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class WasteEntry(Base):
    """Separate daily waste entry form — one row per machine per shift."""
    __tablename__ = "waste_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[str] = mapped_column(String(1), nullable=False)
    department: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ratio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    target_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    waste_kg: Mapped[float] = mapped_column(Float, nullable=False)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    operator_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    operator_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    entered_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RFManpowerPlan(Base):
    """Ring Frame common category manpower — headcount by machine range and role."""
    __tablename__ = "rf_manpower_plan"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[str] = mapped_column(String(1), nullable=False)
    # category: line_man | doffer | house_keeper | pneumafil_collection |
    #           floor_cleaner | gripperman | cope_carrier | robo_doffer |
    #           roving_carrier | maintenance_assi
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    mc_id_from: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mc_id_to: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    total_machines: Mapped[int] = mapped_column(Integer, default=0)
    headcount: Mapped[int] = mapped_column(Integer, default=0)
    supervisor: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("mill_id", "date", "shift", "category", "mc_id_from",
                         name="uq_rf_manpower_mill_date_shift_cat_from"),
    )


class MixingChangeFibreRow(Base):
    """Per-fibre line on a Mixing Change Intimation Slip."""
    __tablename__ = "mixing_change_fibre_rows"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    change_log_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("mixing_change_log.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    # fibre_type: cotton | polyester | viscose | others
    fibre_type: Mapped[str] = mapped_column(String(50), nullable=False)
    present_lot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    proposed_lot: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

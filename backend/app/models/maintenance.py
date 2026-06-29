from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from typing import Optional
from datetime import datetime
from app.db.base import Base, TimestampMixin, generate_uuid


class MaintenanceLog(TimestampMixin, Base):
    __tablename__ = "maintenance_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    technician_id: Mapped[str] = mapped_column(String(36), ForeignKey("technicians.id"), nullable=True)
    technician_name: Mapped[str] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    spare_used: Mapped[str] = mapped_column(String(500), nullable=True)
    downtime_min: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0)


class MaintenanceSchedule(Base):
    __tablename__ = "maintenance_schedule"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    frequency_days: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    last_done: Mapped[str] = mapped_column(String(10), nullable=True)
    next_due: Mapped[str] = mapped_column(String(10), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # AACSL enrichment fields
    department: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    lubricant_name: Mapped[str] = mapped_column(String(200), nullable=True)
    lubricant_quantity: Mapped[str] = mapped_column(String(100), nullable=True)
    manpower_count: Mapped[int] = mapped_column(Integer, nullable=True)
    machine_count: Mapped[int] = mapped_column(Integer, nullable=True)
    sl_no: Mapped[int] = mapped_column(Integer, nullable=True)
    # machine line / unit tracking (e.g. "BDA-1", "Line-1 MC-05", "A/C Unit-1A")
    machine_line_code: Mapped[str] = mapped_column(String(100), nullable=True)
    # cot grinding specific
    opening_dia_mm: Mapped[float] = mapped_column(Float, nullable=True)
    current_dia_mm: Mapped[float] = mapped_column(Float, nullable=True)
    grinding_freq_days: Mapped[int] = mapped_column(Integer, nullable=True)
    last_grinding_date: Mapped[str] = mapped_column(String(10), nullable=True)


class Technician(Base):
    __tablename__ = "technicians"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    specialization: Mapped[str] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PMEntryLog(TimestampMixin, Base):
    """
    Section-specific maintenance entry records.
    entry_type: 'activity' | 'cot_grinding' | 'ac_plant'
    section: 'Blowroom' | 'Carding' | 'Drawing' | 'Simplex' | 'Ring Frame' | 'A/C Plant' | 'Buffing Room'
    data: JSONB — section-specific fields stored as structured dict
    """
    __tablename__ = "pm_entry_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    entry_date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    section: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entry_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Common fields
    machine_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    machine_line_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    activity: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    done_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="done", nullable=False)
    # Section-specific structured data (dia readings, shore hardness, task details etc.)
    data: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True, default=dict)


class MachineParameter(Base):
    __tablename__ = "machine_parameters"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    parameter_name: Mapped[str] = mapped_column(String(200), nullable=False)
    standard_value: Mapped[str] = mapped_column(String(100), nullable=True)
    min_value: Mapped[str] = mapped_column(String(100), nullable=True)
    max_value: Mapped[str] = mapped_column(String(100), nullable=True)
    unit: Mapped[str] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

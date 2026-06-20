from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Date, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, date
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid
import enum


class MachineStatus(str, enum.Enum):
    RUNNING = "running"
    IDLE = "idle"
    BREAKDOWN = "breakdown"


class ShiftType(str, enum.Enum):
    A = "A"
    B = "B"
    C = "C"


class EntryStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class StopType(str, enum.Enum):
    BREAKDOWN_MECHANICAL = "breakdown_mechanical"
    BREAKDOWN_ELECTRICAL = "breakdown_electrical"
    BREAKDOWN_POWER_FAILURE = "breakdown_power_failure"
    BREAKDOWN_END_BREAKAGE = "breakdown_end_breakage"
    PLANNED_MAINTENANCE = "planned_maintenance"
    PLANNED_WASTE_COLLECT = "planned_waste_collect"
    PLANNED_COUNT_CHANGE = "planned_count_change"
    PLANNED_LOT_CHANGE = "planned_lot_change"
    UTILITY_FAILURE = "utility_failure"


class Machine(Base):
    __tablename__ = "machines"

    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_machines_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    machine_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    department_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("master_departments.id"), nullable=True, index=True)
    serial_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    spindles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # v2: spindle count from registers (may differ from spindles for section tracking)
    spindle_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    installation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    amc_expiry: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    current_status: Mapped[str] = mapped_column(String(20), default="running")
    target_kg: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # v2: line/section hierarchy (e.g. line_code="A", machine_number="01", section="Ring Frame A-Line")
    line_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    machine_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    section: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)


class ProductionEntry(TimestampMixin, Base):
    __tablename__ = "production_entries"
    __table_args__ = (
        UniqueConstraint("date", "shift", "machine_code", "department", name="uq_production_entry_shift_machine"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[str] = mapped_column(String(1), nullable=False)
    # v2: hour block within shift e.g. "08:00", "10:00", "12:00", "14:00"
    hour_block: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    # machine_code: string reference to machines.code; DB FK dropped in migration 023
    # (machines.code is now unique per mill, not globally — Wave 3B will add machine_id UUID FK)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[str] = mapped_column(String(200), nullable=False)
    # v2: lot linkage
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    lot_no: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # production kg (supervisor estimate — kept for backward compat)
    produced_kg: Mapped[float] = mapped_column(Float, nullable=False)
    waste_kg: Mapped[float] = mapped_column(Float, default=0)
    count: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # v2: Ring Frame meter reading method
    opening_meter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    closing_meter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    spindle_meters: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # closing - opening
    # v2: Simplex bobbin count method
    opening_bobbin_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    closing_bobbin_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # v2: computed vs actual production (for variance tracking)
    production_kg_computed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    production_kg_actual: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    variance_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # v2: fiber composition snapshot at time of entry e.g. {"cotton": 60, "polyester": 40}
    fiber_composition: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approved_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    entered_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)


class OperatorGroup(Base):
    """Named operator assigned to a fixed set of machines per mill."""
    __tablename__ = "operator_groups"
    __table_args__ = (
        UniqueConstraint("mill_id", "name", name="uq_operator_groups_mill_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    emp_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    machine_codes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MachineGroup(Base):
    """Named machine set (e.g. 'Carding Line 1', 'Ring Frame Section A').
    Groups are defined by the machine set, not by operator.
    A machine can appear in multiple groups."""
    __tablename__ = "machine_groups"
    __table_args__ = (
        UniqueConstraint("mill_id", "name", name="uq_machine_groups_mill_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    machine_codes: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Shift(Base):
    __tablename__ = "shifts"

    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_shifts_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(10), nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)


class DowntimeLog(TimestampMixin, Base):
    __tablename__ = "downtime_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    # machine_code: string reference to machines.code; DB FK dropped in migration 023
    machine_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=0)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    reported_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    # v2: stop type taxonomy
    stop_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    production_loss_kg: Mapped[float] = mapped_column(Float, default=0)
    is_utility_breakdown: Mapped[bool] = mapped_column(Boolean, default=False)
    # FK to utility_breakdowns.id when this stop was caused by utility failure
    utility_ref_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)
    # v2 DATALOG fields (migration 020)
    datalog_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    stop_from: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    stop_to: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

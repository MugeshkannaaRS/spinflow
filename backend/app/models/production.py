from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date
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


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=True)
    machine_type: Mapped[str] = mapped_column(String(50), nullable=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    department_id: Mapped[str] = mapped_column(String(36), ForeignKey("master_departments.id"), nullable=True, index=True)
    serial_no: Mapped[str] = mapped_column(String(100), nullable=True)
    make: Mapped[str] = mapped_column(String(100), nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=True)
    spindles: Mapped[int] = mapped_column(Integer, nullable=True)
    installation_date: Mapped[date] = mapped_column(Date, nullable=True)
    amc_expiry: Mapped[date] = mapped_column(Date, nullable=True)
    status: Mapped[bool] = mapped_column(Boolean, default=True)
    current_status: Mapped[str] = mapped_column(String(20), default="running")
    target_kg: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProductionEntry(TimestampMixin, Base):
    __tablename__ = "production_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    shift: Mapped[str] = mapped_column(String(1), nullable=False)
    machine_code: Mapped[str] = mapped_column(String(50), ForeignKey("machines.code"), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    operator: Mapped[str] = mapped_column(String(200), nullable=False)
    produced_kg: Mapped[float] = mapped_column(Float, nullable=False)
    waste_kg: Mapped[float] = mapped_column(Float, default=0)
    count: Mapped[str] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    entered_by: Mapped[str] = mapped_column(String(200), nullable=True)


class Shift(Base):
    __tablename__ = "shifts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(10), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    start_time: Mapped[str] = mapped_column(String(5), nullable=False)
    end_time: Mapped[str] = mapped_column(String(5), nullable=False)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)


class DowntimeLog(TimestampMixin, Base):
    __tablename__ = "downtime_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    machine_code: Mapped[str] = mapped_column(String(50), ForeignKey("machines.code"), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=0)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    reported_by: Mapped[str] = mapped_column(String(200), nullable=True)

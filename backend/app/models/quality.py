from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid
import enum


class TestStatus(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    PENDING = "pending"


class QualityTest(TimestampMixin, Base):
    __tablename__ = "quality_tests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=True)
    machine_code: Mapped[str] = mapped_column(String(50), nullable=True)
    sample_ref: Mapped[str] = mapped_column(String(50), nullable=True)
    result: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=True)
    standard: Mapped[float] = mapped_column(Float, nullable=False)
    u_percent: Mapped[float] = mapped_column(Float, nullable=True)
    csp: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    tested_by: Mapped[str] = mapped_column(String(200), nullable=True)


class LabReport(TimestampMixin, Base):
    __tablename__ = "lab_reports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=True)
    report_date: Mapped[str] = mapped_column(String(10), nullable=False)
    csp: Mapped[float] = mapped_column(Float, nullable=True)
    count_ne: Mapped[float] = mapped_column(Float, nullable=True)
    moisture: Mapped[float] = mapped_column(Float, nullable=True)
    strength: Mapped[float] = mapped_column(Float, nullable=True)
    uster_cv: Mapped[float] = mapped_column(Float, nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    tested_by: Mapped[str] = mapped_column(String(200), nullable=True)


class QualityApproval(TimestampMixin, Base):
    __tablename__ = "quality_approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    produced_kg: Mapped[float] = mapped_column(Float, default=0)
    sample_date: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)

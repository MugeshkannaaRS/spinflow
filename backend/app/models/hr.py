from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, date
from app.db.base import Base, TimestampMixin, generate_uuid
import enum


class AttendanceStatus(str, enum.Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half-day"
    LEAVE = "leave"


class LeaveStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    role: Mapped[str] = mapped_column(String(100), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    aadhar: Mapped[str] = mapped_column(String(20), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    doj: Mapped[str] = mapped_column(String(10), nullable=True)
    salary: Mapped[float] = mapped_column(Float, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    daily_wage: Mapped[float] = mapped_column(Float, default=0.0)
    shift: Mapped[str] = mapped_column(String(10), nullable=True)
    pf_no: Mapped[str] = mapped_column(String(50), nullable=True)
    esic_no: Mapped[str] = mapped_column(String(50), nullable=True)
    bank_account: Mapped[str] = mapped_column(String(50), nullable=True)
    bank_ifsc: Mapped[str] = mapped_column(String(20), nullable=True)
    pf_enrolled: Mapped[bool] = mapped_column(Boolean, default=False)
    esic_enrolled: Mapped[bool] = mapped_column(Boolean, default=False)


class Attendance(Base):
    __tablename__ = "attendance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    employee_name: Mapped[str] = mapped_column(String(200), nullable=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    shift: Mapped[str] = mapped_column(String(10), default="General")
    status: Mapped[str] = mapped_column(String(20), default="present")
    check_in: Mapped[str] = mapped_column(String(5), nullable=True)
    check_out: Mapped[str] = mapped_column(String(5), nullable=True)
    overtime_hours: Mapped[float] = mapped_column(Float, default=0)


class Leave(TimestampMixin, Base):
    __tablename__ = "leaves"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    employee_name: Mapped[str] = mapped_column(String(200), nullable=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    from_date: Mapped[str] = mapped_column(String(10), nullable=False)
    to_date: Mapped[str] = mapped_column(String(10), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class EmployeeShift(Base):
    __tablename__ = "employee_shifts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False)
    shift: Mapped[str] = mapped_column(String(10), nullable=False)
    effective_from: Mapped[str] = mapped_column(String(10), nullable=False)
    effective_to: Mapped[str] = mapped_column(String(10), nullable=True)

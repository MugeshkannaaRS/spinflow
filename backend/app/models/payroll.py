from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, UniqueConstraint, func, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.base import Base, generate_uuid


class PayrollMonth(Base):
    __tablename__ = "payroll_months"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    total_employees: Mapped[int] = mapped_column(Integer, default=0)
    total_gross: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    total_deductions: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    total_net: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    total_pf: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    total_esic: Mapped[float] = mapped_column(Numeric(14, 2), default=0.0)
    processed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    approved_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("mill_id", "month", "year", name="uq_payroll_month_mill_month_year"),
    )


class PayslipEntry(Base):
    __tablename__ = "payslip_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    payroll_month_id: Mapped[str] = mapped_column(String(36), ForeignKey("payroll_months.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    present_days: Mapped[int] = mapped_column(Integer, default=0)
    absent_days: Mapped[int] = mapped_column(Integer, default=0)
    half_days: Mapped[int] = mapped_column(Integer, default=0)
    overtime_hours: Mapped[float] = mapped_column(Float, default=0.0)
    daily_wage: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    basic_wage: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    overtime_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    gross_wage: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    pf_employee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    pf_employer: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    esic_employee: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    esic_employer: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    other_deductions: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    net_wage: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)
    payment_mode: Mapped[str] = mapped_column(String(20), default="bank")
    payment_ref: Mapped[str] = mapped_column(String(200), nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    remarks: Mapped[str] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("payroll_month_id", "employee_id", name="uq_payslip_month_employee"),
    )

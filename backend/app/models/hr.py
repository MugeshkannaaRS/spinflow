from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Numeric, Date, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


class Employee(TimestampMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("code", "mill_id", name="uq_employees_code_mill"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    sl_no: Mapped[int] = mapped_column(Integer, nullable=True)
    employee_id: Mapped[str] = mapped_column(String(50), nullable=True)
    joining_date: Mapped[date] = mapped_column(Date, nullable=True)
    gen: Mapped[str] = mapped_column(String(10), nullable=True)
    dob: Mapped[date] = mapped_column(Date, nullable=True)
    age: Mapped[int] = mapped_column(Integer, nullable=True)
    gender: Mapped[str] = mapped_column(String(10), nullable=True)
    grade: Mapped[str] = mapped_column(String(20), nullable=True)
    designation: Mapped[str] = mapped_column(String(100), nullable=True)
    section: Mapped[str] = mapped_column(String(100), nullable=True)
    department_name: Mapped[str] = mapped_column(String(100), nullable=True)
    bank_account_no: Mapped[str] = mapped_column(String(50), nullable=True)
    basic: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    house_rent: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    medical: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    conveyance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    food_allowance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    wages: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    increment: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total_salary: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    mobile_bill: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    shift_benefit: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    wages_of_month: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    days_of_month: Mapped[int] = mapped_column(Integer, default=26)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
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


class MonthlyPayroll(TimestampMixin, Base):
    __tablename__ = "monthly_payroll"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    days_of_month: Mapped[int] = mapped_column(Integer, default=26)
    calculate_days: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    actual_attendance: Mapped[int] = mapped_column(Integer, default=0)
    day_off: Mapped[int] = mapped_column(Integer, default=0)
    cl: Mapped[int] = mapped_column(Integer, default=0)
    sl: Mapped[int] = mapped_column(Integer, default=0)
    el: Mapped[int] = mapped_column(Integer, default=0)
    comp_leave: Mapped[int] = mapped_column(Integer, default=0)
    festival_holiday: Mapped[int] = mapped_column(Integer, default=0)
    absent_days: Mapped[int] = mapped_column(Integer, default=0)
    payable_days: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    payable_salary: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    ot_hours: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    ot_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    festival_duty_benefit: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    festival_holiday_allowance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    ifter_days: Mapped[int] = mapped_column(Integer, default=0)
    ifter_allowance: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    special_food: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    attendance_bonus: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    arrear_others: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    shift_qty: Mapped[int] = mapped_column(Integer, default=0)
    shift_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    roster_qty: Mapped[int] = mapped_column(Integer, default=0)
    roster_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    absent_deduction: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    advance_deduction: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    tax_deduction: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    net_payable: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    is_finalized: Mapped[bool] = mapped_column(Boolean, default=False)


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


class EmployeeCustomField(TimestampMixin, Base):
    __tablename__ = "employee_custom_fields"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    field_type: Mapped[str] = mapped_column(String(20), default="text")


class EmployeeCustomValue(TimestampMixin, Base):
    __tablename__ = "employee_custom_values"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=False, index=True)
    field_id: Mapped[str] = mapped_column(String(36), ForeignKey("employee_custom_fields.id"), nullable=False)
    value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

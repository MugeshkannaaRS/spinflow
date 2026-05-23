from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class PayrollProcessRequest(BaseModel):
    mill_id: str
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020)


class PayrollMonthOut(BaseModel):
    id: str
    mill_id: str
    month: int
    year: int
    status: str
    total_employees: int
    total_gross: float
    total_deductions: float
    total_net: float
    total_pf: float
    total_esic: float
    processed_by: Optional[str] = None
    approved_by: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PayslipOut(BaseModel):
    id: str
    payroll_month_id: str
    employee_id: str
    mill_id: str
    month: int
    year: int
    present_days: int
    absent_days: int
    half_days: int
    overtime_hours: float
    daily_wage: float
    basic_wage: float
    overtime_amount: float
    gross_wage: float
    pf_employee: float
    pf_employer: float
    esic_employee: float
    esic_employer: float
    other_deductions: float
    net_wage: float
    payment_mode: str
    payment_ref: Optional[str] = None
    paid_at: Optional[datetime] = None
    status: str
    remarks: Optional[str] = None
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    department: Optional[str] = None

    class Config:
        from_attributes = True


class PayrollSummaryRow(BaseModel):
    month: int
    year: int
    total_employees: int
    total_gross: float
    total_net: float
    total_pf: float
    total_esic: float
    status: str

from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date, datetime


class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    sl_no: Optional[int] = None
    employee_id: Optional[str] = None
    department: str
    designation: Optional[str] = None
    section: Optional[str] = None
    department_name: Optional[str] = None
    shift: str = "General"
    date_of_joining: Optional[date] = None
    dob: Optional[date] = None
    gender: Optional[str] = None
    grade: Optional[str] = None
    bank_account_no: Optional[str] = None
    basic: Optional[float] = 0
    house_rent: Optional[float] = 0
    medical: Optional[float] = 0
    conveyance: Optional[float] = 0
    food_allowance: Optional[float] = 0
    wages: Optional[float] = 0
    increment: Optional[float] = 0
    mobile_bill: Optional[float] = 0
    shift_benefit: Optional[float] = 0
    days_of_month: Optional[int] = 30
    total_salary: Optional[float] = None
    phone: Optional[str] = None
    mill_id: Optional[str] = None

    @field_validator("shift")
    @classmethod
    def validate_shift(cls, v: str) -> str:
        allowed = {"A", "B", "C", "General"}
        if v not in allowed:
            raise ValueError("shift must be one of A, B, C, General")
        return v


class EmployeeOut(BaseModel):
    id: str
    code: Optional[str] = None
    name: Optional[str] = None
    sl_no: Optional[int] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    section: Optional[str] = None
    department_name: Optional[str] = None
    shift: Optional[str] = None
    joining_date: Optional[date] = None
    dob: Optional[date] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    grade: Optional[str] = None
    gen: Optional[str] = None
    bank_account_no: Optional[str] = None
    basic: Optional[float] = 0
    house_rent: Optional[float] = 0
    medical: Optional[float] = 0
    conveyance: Optional[float] = 0
    food_allowance: Optional[float] = 0
    wages: Optional[float] = 0
    increment: Optional[float] = 0
    total_salary: Optional[float] = 0
    mobile_bill: Optional[float] = 0
    shift_benefit: Optional[float] = 0
    wages_of_month: Optional[float] = 0
    days_of_month: Optional[int] = 30
    phone: Optional[str] = None
    is_active: Optional[bool] = True
    mill_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    sl_no: Optional[int] = None
    employee_id: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    section: Optional[str] = None
    department_name: Optional[str] = None
    shift: Optional[str] = None
    gender: Optional[str] = None
    grade: Optional[str] = None
    bank_account_no: Optional[str] = None
    basic: Optional[float] = None
    house_rent: Optional[float] = None
    medical: Optional[float] = None
    conveyance: Optional[float] = None
    food_allowance: Optional[float] = None
    wages: Optional[float] = None
    increment: Optional[float] = None
    total_salary: Optional[float] = None
    mobile_bill: Optional[float] = None
    shift_benefit: Optional[float] = None
    days_of_month: Optional[int] = None
    phone: Optional[str] = None
    is_active: Optional[bool] = None


class MonthlyPayrollCreate(BaseModel):
    month: int
    year: int
    mill_id: str


class MonthlyPayrollOut(BaseModel):
    id: str
    employee_id: str
    mill_id: str
    month: int
    year: int
    days_of_month: int = 30

    class Config:
        from_attributes = True


class MonthlyPayrollUpdate(BaseModel):
    days_of_month: Optional[int] = None
    calculate_days: Optional[float] = None
    actual_attendance: Optional[int] = None
    day_off: Optional[int] = None
    cl: Optional[int] = None
    sl: Optional[int] = None
    el: Optional[int] = None
    comp_leave: Optional[int] = None
    festival_holiday: Optional[int] = None
    absent_days: Optional[int] = None
    payable_days: Optional[float] = None
    payable_salary: Optional[float] = None
    ot_hours: Optional[float] = None
    ot_amount: Optional[float] = None
    festival_duty_benefit: Optional[float] = None
    festival_holiday_allowance: Optional[float] = None
    ifter_days: Optional[int] = None
    ifter_allowance: Optional[float] = None
    special_food: Optional[float] = None
    attendance_bonus: Optional[float] = None
    arrear_others: Optional[float] = None
    shift_qty: Optional[int] = None
    shift_amount: Optional[float] = None
    roster_qty: Optional[int] = None
    roster_amount: Optional[float] = None
    absent_deduction: Optional[float] = None
    advance_deduction: Optional[float] = None
    tax_deduction: Optional[float] = None
    net_payable: Optional[float] = None
    is_finalized: Optional[bool] = None


class MonthlyPayrollListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[MonthlyPayrollOut]


class PayrollCalculateRequest(BaseModel):
    month: int
    year: int
    mill_id: str


class PayrollFinalizeRequest(BaseModel):
    month: int
    year: int
    mill_id: str


class AttendanceCreate(BaseModel):
    employee_id: str
    attendance_date: date
    status: str
    in_time: Optional[str] = None
    out_time: Optional[str] = None
    overtime_hours: float = Field(default=0.0, ge=0)

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        allowed = {"present", "absent", "half_day", "leave"}
        if v not in allowed:
            raise ValueError(f"status must be one of {allowed}")
        return v


class AttendanceOut(BaseModel):
    id: str
    employee_id: str
    date: Optional[str] = None
    employee_name: Optional[str] = None
    department: Optional[str] = None
    shift: Optional[str] = None
    status: Optional[str] = None
    check_in: Optional[str] = None
    check_out: Optional[str] = None
    overtime_hours: Optional[float] = None
    marked_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttendanceBulkCreate(BaseModel):
    attendance_date: date
    records: List[AttendanceCreate] = Field(..., min_length=1)


class AttendanceSummary(BaseModel):
    date: Optional[date] = None
    total_employees: int = 0
    present: int = 0
    absent: int = 0
    on_leave: int = 0
    ot_hours: float = 0.0


class LeaveRequestCreate(BaseModel):
    employee_id: str
    leave_type: str
    from_date: date
    to_date: date
    reason: str = Field(..., min_length=5)

    @field_validator("leave_type")
    @classmethod
    def validate_leave_type(cls, v: str) -> str:
        allowed = {"CL", "SL", "PL", "LOP"}
        if v not in allowed:
            raise ValueError(f"leave_type must be one of {allowed}")
        return v

    @model_validator(mode="after")
    def validate_dates(self):
        if self.to_date < self.from_date:
            raise ValueError("to_date must be on or after from_date")
        return self


class LeaveActionRequest(BaseModel):
    leave_id: str
    action: str
    approved_by: str
    remarks: Optional[str] = None


class LeaveRequestOut(BaseModel):
    id: str
    employee_id: str
    employee_name: Optional[str] = None
    department: Optional[str] = None
    leave_type: Optional[str] = None
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    reason: Optional[str] = None
    status: Optional[str] = None
    applied_by: Optional[str] = None
    approved_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployeeBulkItem(BaseModel):
    employee_code: str
    full_name: str
    department: str = "General"
    designation: Optional[str] = None
    section: Optional[str] = None
    shift: str = "General"
    date_of_joining: Optional[str] = None
    dob: Optional[str] = None
    gen: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    grade: Optional[str] = None
    phone: Optional[str] = None
    sl_no: Optional[int] = None
    bank_account_no: Optional[str] = None
    basic: Optional[float] = None
    house_rent: Optional[float] = None
    medical: Optional[float] = None
    conveyance: Optional[float] = None
    food_allowance: Optional[float] = None
    wages: Optional[float] = None
    increment: Optional[float] = None
    total_salary: Optional[float] = None
    wages_of_month: Optional[float] = None
    days_of_month: Optional[int] = None
    mobile_bill: Optional[float] = None
    shift_benefit: Optional[float] = None
    shift_qty: Optional[int] = None
    shift_tk: Optional[float] = None
    roster_qty: Optional[int] = None
    roster_tk: Optional[float] = None
    calculate_days: Optional[float] = None
    actual_attendance: Optional[int] = None
    day_off: Optional[int] = None
    cl: Optional[int] = None
    sl: Optional[int] = None
    el: Optional[int] = None
    comp_leave: Optional[int] = None
    festival_holiday: Optional[int] = None
    absent_days: Optional[int] = None
    payable_days: Optional[float] = None
    payable_salary: Optional[float] = None
    ot_hours: Optional[float] = None
    ot_amount: Optional[float] = None
    festival_duty_benefit: Optional[float] = None
    festival_holiday_allowance: Optional[float] = None
    ifter_days: Optional[int] = None
    ifter_allowance: Optional[float] = None
    special_food: Optional[float] = None
    attendance_bonus: Optional[float] = None
    arrear_others: Optional[float] = None
    absent_deduction: Optional[float] = None
    advance_deduction: Optional[float] = None
    tax_deduction: Optional[float] = None
    net_payable: Optional[float] = None


class EmployeeBulkCreate(BaseModel):
    items: List[EmployeeBulkItem]


class EmployeeBulkResponse(BaseModel):
    created: int
    errors: List[str]

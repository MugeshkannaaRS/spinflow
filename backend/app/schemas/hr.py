from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional, List
from datetime import date, datetime


class EmployeeCreate(BaseModel):
    employee_code: str
    full_name: str
    department: str
    designation: str
    shift: str
    date_of_joining: Optional[date] = None
    phone: Optional[str] = None
    aadhaar_no: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    pf_no: Optional[str] = None
    esic_no: Optional[str] = None
    daily_wage: Optional[float] = Field(default=None, ge=0)

    @field_validator("shift")
    @classmethod
    def validate_shift(cls, v: str) -> str:
        allowed = {"A", "B", "C", "G"}
        if v not in allowed:
            raise ValueError(f"shift must be one of {allowed}")
        return v


class EmployeeOut(BaseModel):
    id: str
    employee_code: Optional[str] = None
    full_name: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    shift: Optional[str] = None
    date_of_joining: Optional[date] = None
    phone: Optional[str] = None
    pf_no: Optional[str] = None
    esic_no: Optional[str] = None
    daily_wage: Optional[float] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class EmployeeUpdate(BaseModel):
    department: Optional[str] = None
    designation: Optional[str] = None
    shift: Optional[str] = None
    phone: Optional[str] = None
    daily_wage: Optional[float] = None
    is_active: Optional[bool] = None


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

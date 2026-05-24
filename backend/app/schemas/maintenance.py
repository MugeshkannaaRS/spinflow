from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import date, datetime


class MaintenanceCreate(BaseModel):
    machine_id: str
    maintenance_type: str
    failure_type: Optional[str] = None
    description: str = Field(..., min_length=5)
    priority: str = "MEDIUM"
    estimated_minutes: Optional[int] = Field(default=None, gt=0)

    @field_validator("maintenance_type")
    @classmethod
    def validate_maintenance_type(cls, v: str) -> str:
        allowed = {"breakdown", "preventive", "predictive"}
        if v not in allowed:
            raise ValueError(f"maintenance_type must be one of {allowed}")
        return v

    @field_validator("failure_type")
    @classmethod
    def validate_failure_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            allowed = {"mechanical", "electrical", "pneumatic", "other"}
            if v not in allowed:
                raise ValueError(f"failure_type must be one of {allowed}")
        return v

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: str) -> str:
        allowed = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        if v not in allowed:
            raise ValueError(f"priority must be one of {allowed}")
        return v


class MaintenanceOut(BaseModel):
    id: str
    machine_id: Optional[str] = None
    maintenance_type: Optional[str] = None
    failure_type: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None
    reported_by: Optional[str] = None
    assigned_to: Optional[str] = None
    resolved_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MaintenanceUpdate(BaseModel):
    status: Optional[str] = None
    resolution_notes: Optional[str] = None
    actual_minutes: Optional[int] = Field(default=None, gt=0)
    assigned_to: Optional[str] = None


class MaintenanceListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[MaintenanceOut]


class ScheduleCreate(BaseModel):
    machine_id: str
    schedule_type: str
    frequency_days: int = Field(..., gt=0)
    next_due_date: date
    description: Optional[str] = None


class ScheduleOut(BaseModel):
    id: str
    machine_id: Optional[str] = None
    schedule_type: Optional[str] = None
    frequency_days: Optional[int] = None
    next_due_date: Optional[date] = None
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScheduleBulkItem(BaseModel):
    machine_code: str
    task_description: str
    frequency: str
    last_done_date: Optional[str] = None
    next_due_date: Optional[str] = None
    technician_name: Optional[str] = None


class ScheduleBulkCreate(BaseModel):
    items: List[ScheduleBulkItem]


class BulkResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str]


class ParameterBulkItem(BaseModel):
    machine_code: str
    parameter_name: str
    standard_value: Optional[str] = None
    min_value: Optional[str] = None
    max_value: Optional[str] = None
    unit: Optional[str] = None


class ParameterBulkCreate(BaseModel):
    items: List[ParameterBulkItem]


class MachineParameterOut(BaseModel):
    id: str
    machine_code: str
    parameter_name: str
    standard_value: Optional[str] = None
    min_value: Optional[str] = None
    max_value: Optional[str] = None
    unit: Optional[str] = None

    class Config:
        from_attributes = True

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


class MachineCreate(BaseModel):
    code: str
    name: Optional[str] = None
    machine_type: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    spindles: Optional[int] = None
    installation_date: Optional[date] = None
    amc_expiry: Optional[date] = None
    target_kg: float = 0


class MachineResponse(BaseModel):
    id: str
    code: str
    name: Optional[str] = None
    machine_type: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_no: Optional[str] = None
    mill_id: Optional[str] = None
    spindles: Optional[int] = None
    installation_date: Optional[date] = None
    amc_expiry: Optional[date] = None
    status: Optional[bool] = None
    current_status: Optional[str] = None
    target_kg: float = 0

    class Config:
        from_attributes = True


class ShiftCreate(BaseModel):
    code: str = Field(..., pattern="^(A|B|C)$")
    name: str
    start_time: str
    end_time: str


class ShiftOut(BaseModel):
    id: str
    code: str
    name: str
    start_time: str
    end_time: str

    class Config:
        from_attributes = True


class ProductionEntryResponse(BaseModel):
    id: str
    date: str
    shift: str
    machine_code: str
    department: str
    operator: str
    produced_kg: float
    waste_kg: float
    count: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProductionEntryCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    machine_code: str
    department: str
    operator: str
    produced_kg: float = Field(..., gt=0)
    waste_kg: float = 0
    count: Optional[str] = None


class DowntimeResponse(BaseModel):
    id: str
    machine_code: str
    reason: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_min: int
    resolved: bool
    reported_by: Optional[str] = None

    class Config:
        from_attributes = True


class DowntimeCreate(BaseModel):
    machine_code: str
    reason: str
    started_at: datetime
    duration_min: int = 0
    reported_by: Optional[str] = None


class ProductionBulkItem(BaseModel):
    machine_code: str
    operator: str
    produced_kg: float = Field(..., ge=0)
    waste_kg: float = 0
    count: Optional[str] = None
    stoppage_mins: int = 0
    stoppage_reason: Optional[str] = None
    machine_status: str = "running"


class ProductionBulkCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    department: str
    entries: List[ProductionBulkItem]


class ProductionBulkResponse(BaseModel):
    created: int
    skipped: int
    errors: List[str]

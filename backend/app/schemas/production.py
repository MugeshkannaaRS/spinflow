from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
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
    spindle_count: Optional[int] = None
    installation_date: Optional[date] = None
    amc_expiry: Optional[date] = None
    target_kg: float = 0
    # v2: line/section hierarchy
    line_code: Optional[str] = None
    machine_number: Optional[str] = None
    section: Optional[str] = None


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
    spindle_count: Optional[int] = None
    installation_date: Optional[date] = None
    amc_expiry: Optional[date] = None
    status: Optional[bool] = None
    current_status: Optional[str] = None
    target_kg: float = 0
    line_code: Optional[str] = None
    machine_number: Optional[str] = None
    section: Optional[str] = None
    custom_fields: Optional[dict] = None

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
    hour_block: Optional[str] = None
    machine_code: str
    department: str
    operator: str
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    produced_kg: float
    waste_kg: float
    count: Optional[str] = None
    # v2 meter reading fields
    opening_meter: Optional[float] = None
    closing_meter: Optional[float] = None
    spindle_meters: Optional[float] = None
    opening_bobbin_count: Optional[int] = None
    closing_bobbin_count: Optional[int] = None
    production_kg_computed: Optional[float] = None
    production_kg_actual: Optional[float] = None
    variance_kg: Optional[float] = None
    fiber_composition: Optional[Dict[str, Any]] = None
    stoppage_mins: Optional[int] = None
    stoppage_reason: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    entered_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProductionEntryCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    # Optional 2-hour block within shift: "08:00", "10:00", "12:00", "14:00"
    hour_block: Optional[str] = None
    machine_code: str
    department: str
    operator: str
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    produced_kg: float = Field(..., ge=0)
    waste_kg: float = 0
    count: Optional[str] = None
    # Ring Frame meter reading
    opening_meter: Optional[float] = None
    closing_meter: Optional[float] = None
    spindle_meters: Optional[float] = None
    # Simplex bobbin count
    opening_bobbin_count: Optional[int] = None
    closing_bobbin_count: Optional[int] = None
    production_kg_computed: Optional[float] = None
    production_kg_actual: Optional[float] = None
    variance_kg: Optional[float] = None
    fiber_composition: Optional[Dict[str, Any]] = None


class DowntimeResponse(BaseModel):
    id: str
    machine_code: str
    reason: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_min: int
    resolved: bool
    reported_by: Optional[str] = None
    # v2 stop taxonomy
    stop_type: Optional[str] = None
    production_loss_kg: float = 0
    is_utility_breakdown: bool = False
    utility_ref_id: Optional[str] = None
    mill_id: Optional[str] = None

    class Config:
        from_attributes = True


class DowntimeCreate(BaseModel):
    machine_code: str
    reason: str
    started_at: datetime
    duration_min: int = 0
    reported_by: Optional[str] = None
    stop_type: Optional[str] = None
    production_loss_kg: float = 0
    is_utility_breakdown: bool = False
    utility_ref_id: Optional[str] = None


class ProductionBulkItem(BaseModel):
    machine_code: str
    operator: str
    produced_kg: float = Field(..., ge=0)
    waste_kg: float = 0
    count: Optional[str] = None
    hour_block: Optional[str] = None
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    opening_meter: Optional[float] = None
    closing_meter: Optional[float] = None
    spindle_meters: Optional[float] = None
    opening_bobbin_count: Optional[int] = None
    closing_bobbin_count: Optional[int] = None
    production_kg_computed: Optional[float] = None
    production_kg_actual: Optional[float] = None
    variance_kg: Optional[float] = None
    fiber_composition: Optional[Dict[str, Any]] = None
    stoppage_mins: int = 0
    stoppage_reason: Optional[str] = None
    stop_type: Optional[str] = None
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


# ── Operator Groups ────────────────────────────────────────────────────────────

class OperatorGroupCreate(BaseModel):
    name: str
    emp_id: Optional[str] = None
    machine_codes: Optional[List[str]] = []
    is_active: bool = True
    mill_id: Optional[str] = None  # frontend passes active mill_id for MILL_OWNER


class OperatorGroupUpdate(BaseModel):
    name: Optional[str] = None
    emp_id: Optional[str] = None
    machine_codes: Optional[List[str]] = None
    is_active: Optional[bool] = None


class OperatorGroupResponse(BaseModel):
    id: str
    mill_id: Optional[str] = None
    name: str
    emp_id: Optional[str] = None
    machine_codes: Optional[List[str]] = []
    is_active: bool

    class Config:
        from_attributes = True

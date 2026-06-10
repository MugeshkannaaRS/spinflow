"""Schemas for DatalogStopCode, WasteEntry, RFManpowerPlan, MixingChangeFibreRow."""
from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, time

# ------------------------------------------------------------------ #
# DATALOG Stop Codes                                                   #
# ------------------------------------------------------------------ #

class DatalogStopCodeOut(BaseModel):
    code: int
    name: str
    departments: Optional[Any] = None
    category: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Waste Entry                                                          #
# ------------------------------------------------------------------ #

class WasteEntryCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    department: str
    machine_code: str
    lot_no: Optional[str] = None
    ratio: Optional[str] = None
    target_kg: Optional[float] = None
    waste_kg: float = Field(..., ge=0)
    remarks: Optional[str] = None
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None


class WasteEntryBulkItem(BaseModel):
    machine_code: str
    lot_no: Optional[str] = None
    ratio: Optional[str] = None
    target_kg: Optional[float] = None
    waste_kg: float = Field(..., ge=0)
    remarks: Optional[str] = None
    operator_name: Optional[str] = None


class WasteEntryBulkCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    department: str
    entries: List[WasteEntryBulkItem]


class WasteEntryOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: str
    department: str
    machine_code: str
    lot_no: Optional[str] = None
    ratio: Optional[str] = None
    target_kg: Optional[float] = None
    waste_kg: float
    remarks: Optional[str] = None
    operator_id: Optional[str] = None
    operator_name: Optional[str] = None
    entered_by: Optional[str] = None
    status: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# RF Manpower Plan                                                     #
# ------------------------------------------------------------------ #

RF_CATEGORIES = [
    "line_man", "doffer", "house_keeper", "pneumafil_collection",
    "floor_cleaner", "gripperman", "cope_carrier", "robo_doffer",
    "roving_carrier", "maintenance_assi",
]

RF_CATEGORY_LABELS: Dict[str, str] = {
    "line_man": "Line Man",
    "doffer": "Doffer",
    "house_keeper": "House Keeper",
    "pneumafil_collection": "Pneumafil Collection",
    "floor_cleaner": "Floor Cleaner",
    "gripperman": "Gripperman",
    "cope_carrier": "Cope Carrier",
    "robo_doffer": "Robo Doffer",
    "roving_carrier": "Roving Carrier",
    "maintenance_assi": "Maintenance Assistant",
}


class RFManpowerCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    category: str
    mc_id_from: Optional[str] = None
    mc_id_to: Optional[str] = None
    total_machines: int = 0
    headcount: int = Field(..., ge=0)
    supervisor: Optional[str] = None
    remarks: Optional[str] = None


class RFManpowerBulkCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    rows: List[RFManpowerCreate]


class RFManpowerOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: str
    category: str
    mc_id_from: Optional[str] = None
    mc_id_to: Optional[str] = None
    total_machines: int
    headcount: int
    supervisor: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Mixing Change Fibre Rows                                             #
# ------------------------------------------------------------------ #

class MixingFibreRowCreate(BaseModel):
    fibre_type: str = Field(..., pattern="^(cotton|polyester|viscose|others)$")
    present_lot: Optional[str] = None
    proposed_lot: Optional[str] = None
    remarks: Optional[str] = None


class MixingFibreRowOut(BaseModel):
    id: str
    change_log_id: str
    fibre_type: str
    present_lot: Optional[str] = None
    proposed_lot: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

"""Pydantic schemas for mixing, laydown, JCP, utility breakdown, waste, splice KPI."""
from pydantic import BaseModel, Field, model_validator
from typing import Optional, List, Any, Dict
from datetime import datetime


# ------------------------------------------------------------------ #
# Mixing Recipe                                                        #
# ------------------------------------------------------------------ #

class MixingLayerIn(BaseModel):
    layer_no: int
    fiber_type: str
    percentage: float = Field(..., gt=0, le=100)
    kg_per_layer: Optional[float] = None
    bale_count: Optional[int] = None
    remarks: Optional[str] = None


class MixingRecipeCreate(BaseModel):
    recipe_code: str
    recipe_name: Optional[str] = None
    yarn_count_id: Optional[str] = None
    lot_id: Optional[str] = None
    # e.g. {"cotton_cnc": 60, "polyester": 40}
    fiber_composition: Dict[str, Any]
    layers: Optional[List[MixingLayerIn]] = None
    remarks: Optional[str] = None


class MixingLayerOut(BaseModel):
    id: str
    layer_no: int
    fiber_type: str
    percentage: float
    kg_per_layer: Optional[float] = None
    bale_count: Optional[int] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class MixingRecipeOut(BaseModel):
    id: str
    mill_id: str
    recipe_code: str
    recipe_name: Optional[str] = None
    yarn_count_id: Optional[str] = None
    lot_id: Optional[str] = None
    fiber_composition: Optional[Dict[str, Any]] = None
    is_active: bool
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Mixing Change Log                                                    #
# ------------------------------------------------------------------ #

class MixingChangeCreate(BaseModel):
    change_date: str
    shift: Optional[str] = None
    intimation_slip_no: Optional[str] = None
    old_recipe_id: Optional[str] = None
    new_recipe_id: str
    reason: Optional[str] = None


class MixingChangeOut(BaseModel):
    id: str
    mill_id: str
    change_date: str
    shift: Optional[str] = None
    intimation_slip_no: Optional[str] = None
    old_recipe_id: Optional[str] = None
    new_recipe_id: Optional[str] = None
    reason: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    status: str
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Laydown                                                              #
# ------------------------------------------------------------------ #

class LaydownCreate(BaseModel):
    date: str
    shift: Optional[str] = None
    machine_code: Optional[str] = None
    recipe_id: Optional[str] = None
    bale_count: int = 0
    total_kg: float = 0
    operator: Optional[str] = None
    supervisor: Optional[str] = None
    remarks: Optional[str] = None


class LaydownOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: Optional[str] = None
    machine_code: Optional[str] = None
    recipe_id: Optional[str] = None
    bale_count: int
    total_kg: float
    operator: Optional[str] = None
    supervisor: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Bale Consumption                                                     #
# ------------------------------------------------------------------ #

class BaleConsumptionCreate(BaseModel):
    date: str
    shift: Optional[str] = None
    lot_id: Optional[str] = None
    bale_ref: Optional[str] = None
    fiber_type: Optional[str] = None
    weight_kg: float = Field(..., gt=0)
    department: Optional[str] = None
    machine_code: Optional[str] = None
    laydown_id: Optional[str] = None


class BaleConsumptionOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: Optional[str] = None
    lot_id: Optional[str] = None
    bale_ref: Optional[str] = None
    fiber_type: Optional[str] = None
    weight_kg: float
    department: Optional[str] = None
    machine_code: Optional[str] = None
    laydown_id: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# JCP Clearance                                                        #
# ------------------------------------------------------------------ #

class JCPCreate(BaseModel):
    lot_id: str
    lot_no: Optional[str] = None
    # "quality" or "commercial"
    clearance_type: str = Field(..., pattern="^(quality|commercial)$")
    remarks: Optional[str] = None


class JCPApprove(BaseModel):
    quality_ok: Optional[bool] = None
    commercial_ok: Optional[bool] = None
    remarks: Optional[str] = None


class JCPOut(BaseModel):
    id: str
    mill_id: str
    lot_id: str
    lot_no: Optional[str] = None
    clearance_type: str
    status: str
    quality_ok: bool
    commercial_ok: bool
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    remarks: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Utility Breakdown                                                    #
# ------------------------------------------------------------------ #

class UtilityBreakdownCreate(BaseModel):
    utility_type: str
    started_at: datetime
    affected_departments: Optional[List[str]] = None
    reported_by: Optional[str] = None
    remarks: Optional[str] = None


class UtilityBreakdownResolve(BaseModel):
    ended_at: datetime
    resolved_by: Optional[str] = None
    remarks: Optional[str] = None


class UtilityBreakdownOut(BaseModel):
    id: str
    mill_id: str
    utility_type: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    duration_min: int
    affected_departments: Optional[Any] = None
    total_loss_kg: float
    reported_by: Optional[str] = None
    resolved_by: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Waste Stock                                                          #
# ------------------------------------------------------------------ #

class WasteStockCreate(BaseModel):
    waste_type: str
    bale_ref: Optional[str] = None
    weight_kg: float = Field(..., gt=0)
    date_collected: str
    department: Optional[str] = None
    machine_code: Optional[str] = None


class WasteStockSell(BaseModel):
    sold_to: str
    sale_rate: float = Field(..., gt=0)
    remarks: Optional[str] = None


class WasteStockOut(BaseModel):
    id: str
    mill_id: str
    waste_type: str
    bale_ref: Optional[str] = None
    weight_kg: float
    date_collected: str
    department: Optional[str] = None
    machine_code: Optional[str] = None
    status: str
    sold_at: Optional[datetime] = None
    sold_to: Optional[str] = None
    sale_rate: Optional[float] = None
    sale_amount: Optional[float] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Waste Transfer                                                       #
# ------------------------------------------------------------------ #

class WasteTransferCreate(BaseModel):
    transfer_date: str
    waste_type: str
    from_department: Optional[str] = None
    to_location: Optional[str] = None
    bale_count: int = 0
    weight_kg: float = Field(..., gt=0)
    transferred_by: Optional[str] = None
    remarks: Optional[str] = None


class WasteTransferOut(BaseModel):
    id: str
    mill_id: str
    transfer_date: str
    waste_type: str
    from_department: Optional[str] = None
    to_location: Optional[str] = None
    bale_count: int
    weight_kg: float
    transferred_by: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Splice Quality                                                       #
# ------------------------------------------------------------------ #

class SpliceQualityCreate(BaseModel):
    date: str
    shift: Optional[str] = None
    machine_code: Optional[str] = None
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    total_splices: int = Field(..., ge=0)
    rejected_splices: int = Field(..., ge=0)
    operator: Optional[str] = None

    @model_validator(mode="after")
    def compute_rejection_pct(self) -> "SpliceQualityCreate":
        if self.total_splices > 0:
            object.__setattr__(
                self,
                "_rejection_pct",
                round(self.rejected_splices / self.total_splices * 100, 3),
            )
        return self


class SpliceQualityOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: Optional[str] = None
    machine_code: Optional[str] = None
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    total_splices: int
    rejected_splices: int
    rejection_pct: Optional[float] = None
    operator: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ------------------------------------------------------------------ #
# Shift Manpower Plan                                                  #
# ------------------------------------------------------------------ #

class ManpowerPlanCreate(BaseModel):
    date: str
    shift: str = Field(..., pattern="^(A|B|C)$")
    department: str
    planned_count: int = Field(..., ge=0)
    actual_count: int = 0
    supervisor: Optional[str] = None
    remarks: Optional[str] = None


class ManpowerPlanOut(BaseModel):
    id: str
    mill_id: str
    date: str
    shift: str
    department: str
    planned_count: int
    actual_count: int
    supervisor: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

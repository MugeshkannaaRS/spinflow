"""
Quality forms Pydantic schemas for all spinning mill QC modules.
See models/quality_forms.py for the full model definitions (86 forms).
"""
from pydantic import BaseModel, Field
from typing import Optional, Any


class QualityFormFilter(BaseModel):
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    shift_code: Optional[str] = None
    machine_no: Optional[str] = None
    lot_no: Optional[str] = None
    status: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=1000)


class QualityFormListResponse(BaseModel):
    total: int = 0
    page: int = 1
    page_size: int = 20
    pages: int = 0
    data: list[Any] = []


# ─── Waste Study (QmCardingWasteStudy) ─────────────────────────────

class WasteStudyCreate(BaseModel):
    date: str
    machine_no: str
    lot_no: str
    shift_code: str
    delivery_hank: Optional[float] = None
    licker_in_speed: Optional[float] = None
    cylinder_speed: Optional[float] = None
    flats_speed: Optional[float] = None
    delivery_speed: Optional[float] = None
    wing_setting: Optional[str] = None
    empty_can_kg: Optional[float] = None
    sliver_can_gross_kg: Optional[float] = None
    total_production_kg: Optional[float] = None
    licker_in2_waste_kg: Optional[float] = None
    licker_in3_waste_kg: Optional[float] = None
    flat_strips_kg: Optional[float] = None
    suction_hood_back_kg: Optional[float] = None
    suction_hood_front_kg: Optional[float] = None
    remarks: Optional[str] = None


class WasteStudyResponse(BaseModel):
    id: str
    date: str
    machine_no: str
    lot_no: str
    shift_code: str
    delivery_hank: Optional[float] = None
    total_production_kg: Optional[float] = None
    licker_in2_waste_kg: Optional[float] = None
    licker_in3_waste_kg: Optional[float] = None
    flat_strips_kg: Optional[float] = None
    suction_hood_front_kg: Optional[float] = None
    suction_hood_back_kg: Optional[float] = None
    total_wastage_pct: Optional[float] = None
    status: str = "draft"
    remarks: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Simplex Hank Test (QmSimplexHankTest) ─────────────────────────

class SimplexHankCreate(BaseModel):
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    cotton_type: Optional[str] = None
    process: Optional[str] = None
    nominal_hank: Optional[float] = None
    std_hank: Optional[float] = None
    samples_json: Optional[list[float]] = None  # list of sample weights
    remarks: Optional[str] = None


class SimplexHankResponse(BaseModel):
    id: str
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    nominal_hank: Optional[float] = None
    avg_hank: Optional[float] = None
    actual_hank: Optional[float] = None
    cv_pct: Optional[float] = None
    within_spec: Optional[bool] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Sliver Wrapping (QmSliverWrapping) ────────────────────────────

class SliverWrappingCreate(BaseModel):
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    process: str  # BD / FD
    side: Optional[str] = None
    std_hank: Optional[float] = None
    readings_json: Optional[list[float]] = None
    remarks: Optional[str] = None


class SliverWrappingResponse(BaseModel):
    id: str
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    process: str
    side: Optional[str] = None
    std_hank: Optional[float] = None
    avg_weight: Optional[float] = None
    actual_hank: Optional[float] = None
    hank_cv_pct: Optional[float] = None
    ok_input: Optional[bool] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Daily Carding Wrapping (QmCardingWrapping) ────────────────────

class CardingWrappingCreate(BaseModel):
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    line_no: Optional[str] = None
    time_taken: Optional[str] = None
    std_hank: Optional[float] = None
    readings_json: Optional[list[float]] = None
    remarks: Optional[str] = None


class CardingWrappingResponse(BaseModel):
    id: str
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    line_no: Optional[str] = None
    std_hank: Optional[float] = None
    avg_weight: Optional[float] = None
    actual_hank: Optional[float] = None
    cv_pct: Optional[float] = None
    ok_input: Optional[bool] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Autoconer Cut Report (QmClassimatResults) ─────────────────────

class AutoconerCutCreate(BaseModel):
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    count_ne: Optional[float] = None
    group: Optional[str] = None
    speed: Optional[float] = None
    length: Optional[float] = None
    yf_per_100km: Optional[float] = None
    cv_pct: Optional[float] = None
    thin_50_pct: Optional[float] = None
    thick_50_pct: Optional[float] = None
    neps_200_pct: Optional[float] = None
    total_ipi: Optional[float] = None
    remarks: Optional[str] = None


class AutoconerCutResponse(BaseModel):
    id: str
    date: str
    shift_code: str
    machine_no: str
    lot_no: str
    count_ne: Optional[float] = None
    yf_per_100km: Optional[float] = None
    cv_pct: Optional[float] = None
    total_ipi: Optional[float] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Bag Weight Check (QmBagWeightCheck) ──────────────────────────

class BagWeightCreate(BaseModel):
    date: str
    shift_code: str
    lot_no: str
    count_ne: Optional[float] = None
    cone_tip_type: Optional[str] = None
    inspector: Optional[str] = None
    target_weight: Optional[float] = None
    samples_json: Optional[list[dict]] = None
    remarks: Optional[str] = None


class BagWeightResponse(BaseModel):
    id: str
    date: str
    shift_code: str
    lot_no: str
    count_ne: Optional[float] = None
    avg_net_weight: Optional[float] = None
    min_net_weight: Optional[float] = None
    max_net_weight: Optional[float] = None
    std_deviation: Optional[float] = None
    deviation_pct: Optional[float] = None
    pass_pct: Optional[float] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── Paper Cone Check (QmPaperConeCheck) ──────────────────────────

class PaperConeCreate(BaseModel):
    date: str
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    batch_no: Optional[str] = None
    inspector: Optional[str] = None
    samples_json: Optional[list[dict]] = None
    remarks: Optional[str] = None


class PaperConeResponse(BaseModel):
    id: str
    date: str
    supplier_name: Optional[str] = None
    batch_no: Optional[str] = None
    avg_cone_weight: Optional[float] = None
    acceptance_pct: Optional[float] = None
    rejection_pct: Optional[float] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


# ─── CSP Strength (QmRfCspReport) ─────────────────────────────────

class CspStrengthCreate(BaseModel):
    date: str
    machine_no: str
    lot_no: str
    count_ne: Optional[float] = None
    ratio: Optional[str] = None
    tm: Optional[float] = None
    tpi: Optional[float] = None
    samples_json: Optional[list[dict]] = None
    remarks: Optional[str] = None


class CspStrengthResponse(BaseModel):
    id: str
    date: str
    machine_no: str
    lot_no: str
    count_ne: Optional[float] = None
    avg_csp: Optional[float] = None
    cv_pct: Optional[float] = None
    max_csp: Optional[float] = None
    min_csp: Optional[float] = None
    within_spec: Optional[bool] = None
    status: str = "draft"
    remarks: Optional[str] = None

    class Config:
        from_attributes = True

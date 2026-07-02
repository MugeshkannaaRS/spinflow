from pydantic import BaseModel, Field, EmailStr, field_validator, model_validator
from typing import Optional, List
from datetime import date, datetime


class SupplierCreate(BaseModel):
    code: Optional[str] = None
    name: str
    contact_person: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    gstin: Optional[str] = None
    bank_account: Optional[str] = None
    ifsc: Optional[str] = None

    @field_validator("gstin")
    @classmethod
    def validate_gstin(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) != 15:
            raise ValueError("gstin must be exactly 15 characters")
        return v


class SupplierOut(BaseModel):
    id: str
    code: str
    name: str
    contact_person: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CottonPurchaseCreate(BaseModel):
    supplier_id: str
    purchase_date: date
    bale_count: int = Field(..., gt=0)
    weight_kg: float = Field(..., gt=0)
    moisture_pct: Optional[float] = Field(default=None, ge=0, le=100)
    rate_per_quintal: float = Field(..., gt=0)
    invoice_no: Optional[str] = None
    notes: Optional[str] = None
    total_value: Optional[float] = None

    @model_validator(mode="after")
    def set_total_value(self):
        self.total_value = self.bale_count * self.weight_kg * self.rate_per_quintal / 100
        return self


class CottonPurchaseOut(BaseModel):
    id: str
    date: Optional[str] = None
    invoice_no: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    bales: Optional[int] = None
    gross_kg: Optional[float] = None
    net_kg: Optional[float] = None
    rate_per_kg: Optional[float] = None
    moisture: Optional[float] = None
    grade: Optional[str] = None
    gst_amount: Optional[float] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CottonPurchaseListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[CottonPurchaseOut]


class GRNCreate(BaseModel):
    purchase_id: str
    received_bales: int = Field(..., gt=0)
    received_weight_kg: float = Field(..., gt=0)
    moisture_at_grn: Optional[float] = None
    remarks: Optional[str] = None


class BaleCreate(BaseModel):
    bale_number: str
    supplier: str
    lot_number: Optional[str] = None
    date_received: date
    micronaire: float = Field(..., ge=1.0, le=7.0)
    staple_length: Optional[float] = Field(default=None, ge=20.0, le=45.0)
    strength: Optional[float] = Field(default=None, ge=5.0, le=60.0)
    uniformity: Optional[float] = Field(default=None, ge=50.0, le=100.0)
    short_fiber_index: Optional[float] = Field(default=None, ge=0.0, le=50.0)
    moisture: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    trash_area: Optional[float] = Field(default=None, ge=0.0, le=20.0)
    trash_grade: Optional[int] = Field(default=None, ge=0, le=8)
    color_grade: Optional[str] = None
    reflectance: Optional[float] = None
    yellowness: Optional[float] = None
    elongation: Optional[float] = None
    maturity: Optional[float] = None
    sci: Optional[float] = None


class BaleOut(BaseModel):
    id: str
    bale_number: str
    supplier: str
    lot_number: Optional[str] = None
    date_received: Optional[str] = None
    micronaire: float
    staple_length: Optional[float] = None
    strength: Optional[float] = None
    uniformity: Optional[float] = None
    short_fiber_index: Optional[float] = None
    moisture: Optional[float] = None
    trash_area: Optional[float] = None
    trash_grade: Optional[int] = None
    color_grade: Optional[str] = None
    reflectance: Optional[float] = None
    yellowness: Optional[float] = None
    elongation: Optional[float] = None
    maturity: Optional[float] = None
    sci: Optional[float] = None
    quality_index: Optional[float] = None
    category: Optional[str] = None
    status: str = "in-stock"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BaleGroupRequest(BaseModel):
    yarn_count: str
    bale_ids: Optional[List[str]] = None


class BaleGroupResponse(BaseModel):
    yarn_count: str
    recommended_mic_min: float
    recommended_mic_max: float
    recommended_staple_min: float
    recommended_staple_max: float
    selected_bales: List[BaleOut]
    blend_mic: float
    blend_staple: float
    blend_strength: float
    blend_uniformity: float
    mic_cv: float
    quality_index: float
    bale_count: int


class SupplierStat(BaseModel):
    supplier: str
    bale_count: int
    avg_mic: float
    avg_strength: float
    avg_uniformity: float


class LotStat(BaseModel):
    lot_number: str
    bale_count: int
    avg_mic: float


class BaleStatsOut(BaseModel):
    total_bales: int
    in_stock: int
    used: int
    rejected: int
    avg_mic: float
    avg_staple: float
    avg_strength: float
    avg_uniformity: float
    mic_cv: float
    bales_by_category: dict
    supplier_stats: List[SupplierStat]
    lot_stats: List[LotStat]


class GRNOut(BaseModel):
    id: str
    grn_no: str
    purchase_id: str
    received_bales: int
    received_weight_kg: float
    moisture_at_grn: Optional[float] = None
    grn_date: Optional[date] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Cotton Import (L/C consignments) ──────────────────────────────────────────
class CottonImportCreate(BaseModel):
    date: date
    commercial_invoice_no: str
    contract_no: Optional[str] = None
    proforma_ref: Optional[str] = None
    supplier_name: str
    supplier_country: Optional[str] = None
    applicant: Optional[str] = None
    origin: Optional[str] = None
    description: Optional[str] = None
    crop_year: Optional[str] = None
    grade: Optional[str] = None
    staple: Optional[str] = None
    micronaire: Optional[str] = None
    strength: Optional[str] = None
    total_bales: int = Field(default=0, ge=0)
    gross_kg: float = 0.0
    tare_kg: float = 0.0
    net_kg: float = 0.0
    equiv_lbs: float = 0.0
    unit_price: float = 0.0
    unit_uom: str = "cents/lb"
    fob_usd: float = 0.0
    freight_usd: float = 0.0
    total_usd: float = 0.0
    hs_code: Optional[str] = None
    lc_no: Optional[str] = None
    lc_date: Optional[date] = None
    bl_no: Optional[str] = None
    vessel: Optional[str] = None
    shipped_from: Optional[str] = None
    shipped_to: Optional[str] = None
    trade_terms: Optional[str] = None
    container_split: Optional[str] = None  # JSON string e.g. {"AAYML":6,"MSA":6}
    status: str = "in-transit"
    remarks: Optional[str] = None


class CottonImportOut(BaseModel):
    id: str
    date: str
    commercial_invoice_no: str
    contract_no: Optional[str] = None
    proforma_ref: Optional[str] = None
    supplier_name: str
    supplier_country: Optional[str] = None
    applicant: Optional[str] = None
    origin: Optional[str] = None
    description: Optional[str] = None
    crop_year: Optional[str] = None
    grade: Optional[str] = None
    staple: Optional[str] = None
    micronaire: Optional[str] = None
    strength: Optional[str] = None
    total_bales: int = 0
    gross_kg: float = 0.0
    tare_kg: float = 0.0
    net_kg: float = 0.0
    equiv_lbs: float = 0.0
    unit_price: float = 0.0
    unit_uom: Optional[str] = None
    fob_usd: float = 0.0
    freight_usd: float = 0.0
    total_usd: float = 0.0
    hs_code: Optional[str] = None
    lc_no: Optional[str] = None
    lc_date: Optional[str] = None
    bl_no: Optional[str] = None
    vessel: Optional[str] = None
    shipped_from: Optional[str] = None
    shipped_to: Optional[str] = None
    trade_terms: Optional[str] = None
    container_split: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Work Orders (supplier purchase orders) ────────────────────────────────────
class WorkOrderItemIn(BaseModel):
    sl_no: int = 1
    description: str
    unit: Optional[str] = None
    qty: float = 0.0
    unit_price: float = 0.0
    amount: Optional[float] = None  # computed if omitted


class WorkOrderItemOut(BaseModel):
    id: str
    sl_no: int = 1
    description: str
    unit: Optional[str] = None
    qty: float = 0.0
    unit_price: float = 0.0
    amount: float = 0.0

    class Config:
        from_attributes = True


class WorkOrderCreate(BaseModel):
    wo_no: str
    date: date
    supplier_id: Optional[str] = None
    supplier_name: str
    supplier_address: Optional[str] = None
    attn_person: Optional[str] = None
    subject: str = "Work Order"
    currency: str = "BDT"
    amount_in_words: Optional[str] = None
    terms: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    prepared_by: Optional[str] = None
    authorised_by: Optional[str] = None
    status: str = "open"
    remarks: Optional[str] = None
    items: List[WorkOrderItemIn] = []


class WorkOrderOut(BaseModel):
    id: str
    wo_no: str
    date: str
    supplier_id: Optional[str] = None
    supplier_name: str
    supplier_address: Optional[str] = None
    attn_person: Optional[str] = None
    subject: Optional[str] = None
    currency: Optional[str] = None
    net_payable: float = 0.0
    amount_in_words: Optional[str] = None
    terms: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    prepared_by: Optional[str] = None
    authorised_by: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None
    items: List[WorkOrderItemOut] = []

    class Config:
        from_attributes = True

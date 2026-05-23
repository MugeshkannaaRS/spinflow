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
    purchase_no: Optional[str] = None
    supplier_id: str
    purchase_date: Optional[date] = None
    bale_count: Optional[int] = None
    weight_kg: Optional[float] = None
    total_weight_kg: Optional[float] = None
    moisture_pct: Optional[float] = None
    rate_per_quintal: Optional[float] = None
    total_value: Optional[float] = None
    invoice_no: Optional[str] = None
    grn_status: Optional[str] = None
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

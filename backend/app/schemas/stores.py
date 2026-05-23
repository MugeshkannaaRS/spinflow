from pydantic import BaseModel, Field, field_validator, model_validator, computed_field
from typing import Optional, List
from datetime import datetime


class SpareItemCreate(BaseModel):
    item_code: str
    name: str
    category: str
    unit: str
    current_stock: float = Field(default=0, ge=0)
    reorder_level: float = Field(default=0, ge=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    hsn_code: Optional[str] = None
    location: Optional[str] = None


class SpareItemOut(BaseModel):
    id: str
    item_code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    reorder_level: Optional[float] = None
    unit_price: Optional[float] = None
    hsn_code: Optional[str] = None
    location: Optional[str] = None
    created_at: Optional[datetime] = None

    @computed_field
    @property
    def is_low(self) -> bool:
        if self.current_stock is not None and self.reorder_level is not None:
            return self.current_stock <= self.reorder_level
        return False

    class Config:
        from_attributes = True


class SpareItemUpdate(BaseModel):
    current_stock: Optional[float] = None
    reorder_level: Optional[float] = None
    unit_price: Optional[float] = None
    location: Optional[str] = None


class SpareInward(BaseModel):
    item_id: str
    quantity: float = Field(..., gt=0)
    unit_price: Optional[float] = None
    supplier_name: Optional[str] = None
    invoice_no: Optional[str] = None
    remarks: Optional[str] = None


class SpareIssueCreate(BaseModel):
    item_id: str
    machine_id: Optional[str] = None
    maintenance_id: Optional[str] = None
    quantity: float = Field(..., gt=0)
    purpose: Optional[str] = None

    @model_validator(mode="after")
    def check_machine_or_purpose(self):
        if not self.machine_id and not self.purpose:
            raise ValueError("At least one of machine_id or purpose must be provided")
        return self


class SpareIssueOut(BaseModel):
    id: str
    item_id: Optional[str] = None
    machine_id: Optional[str] = None
    maintenance_id: Optional[str] = None
    quantity: Optional[float] = None
    purpose: Optional[str] = None
    issued_by: Optional[str] = None
    issued_at: Optional[datetime] = None

    class Config:
        from_attributes = True

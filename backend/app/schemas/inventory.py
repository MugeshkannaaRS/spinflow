from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


class WarehouseCreate(BaseModel):
    code: str
    name: str
    location: Optional[str] = None
    capacity_bags: Optional[int] = None


class WarehouseOut(BaseModel):
    id: str
    code: str
    name: str
    location: Optional[str] = None
    capacity_bags: Optional[int] = None
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LotCreate(BaseModel):
    lot_no: Optional[str] = None
    count: str
    total_bags: int = Field(..., gt=0)
    bag_weight_kg: float = Field(default=23.0, gt=0)
    warehouse_id: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("count")
    @classmethod
    def validate_count(cls, v: str) -> str:
        if not re.match(r"^\d+s$", v):
            raise ValueError('count must match pattern like "10s", "20s", etc.')
        return v


class LotOut(BaseModel):
    id: str
    lot_no: str
    count: Optional[str] = None
    total_bags: Optional[int] = None
    total_weight_kg: Optional[float] = None
    warehouse_id: Optional[str] = None
    quality_status: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LotListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[LotOut]


class InventoryBagOut(BaseModel):
    id: str
    bag_no: Optional[str] = None
    lot_id: Optional[str] = None
    weight_kg: Optional[float] = None
    qr_code: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StockMovementCreate(BaseModel):
    bag_id: Optional[str] = None
    from_location: Optional[str] = None
    to_location: str
    movement_type: str
    remarks: Optional[str] = None

    @field_validator("movement_type")
    @classmethod
    def validate_movement_type(cls, v: str) -> str:
        allowed = {"INWARD", "TRANSFER", "DISPATCH", "GATE_OUT"}
        if v not in allowed:
            raise ValueError(f"movement_type must be one of {allowed}")
        return v


class StockMovementOut(BaseModel):
    id: str
    bag_id: Optional[str] = None
    from_location: Optional[str] = None
    to_location: Optional[str] = None
    movement_type: Optional[str] = None
    moved_by: Optional[str] = None
    moved_at: Optional[datetime] = None

    class Config:
        from_attributes = True

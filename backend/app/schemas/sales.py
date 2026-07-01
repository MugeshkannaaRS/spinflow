from pydantic import BaseModel, Field, model_validator
from typing import Optional, List


class SalesOrderLineCreate(BaseModel):
    lot_id: str
    warehouse_id: str
    bags_ordered: int = Field(gt=0)
    weight_kg: float = Field(gt=0)
    rate_per_kg: Optional[float] = None


class SalesOrderCreate(BaseModel):
    mill_id: str
    customer_id: str
    order_date: str
    delivery_date: Optional[str] = None
    yarn_count: Optional[str] = None
    incoterms: Optional[str] = None
    notes: Optional[str] = None
    lines: List[SalesOrderLineCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_dates(self) -> "SalesOrderCreate":
        if self.delivery_date and self.order_date > self.delivery_date:
            raise ValueError("delivery_date must be >= order_date")
        return self


class SalesOrderLineOut(BaseModel):
    id: str
    so_id: str
    lot_id: str
    warehouse_id: str
    bags_ordered: int
    bags_delivered: int = 0
    bags_reserved: int = 0
    weight_kg: float
    rate_per_kg: Optional[float] = None
    line_amount: Optional[float] = None
    status: str = "open"
    available_qty: float = 0.0

    class Config:
        from_attributes = True


class SalesOrderOut(BaseModel):
    id: str
    mill_id: str
    so_no: str
    customer_id: str
    status: str
    order_date: str
    delivery_date: Optional[str] = None
    yarn_count: Optional[str] = None
    total_bags: int = 0
    total_weight_kg: float = 0.0
    rate_per_kg: Optional[float] = None
    total_value: Optional[float] = None
    incoterms: Optional[str] = None
    notes: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[str] = None
    created_by: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    lines: List[SalesOrderLineOut] = []

    class Config:
        from_attributes = True


class SalesOrderListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[SalesOrderOut]


class CancelSalesOrderRequest(BaseModel):
    reason: str

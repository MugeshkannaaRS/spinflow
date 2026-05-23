from pydantic import BaseModel, Field
from typing import Optional


class DispatchResponse(BaseModel):
    id: str
    dispatch_no: str
    date: str
    order_no: Optional[str] = None
    customer: str
    lot_no: Optional[str] = None
    quantity_kg: float
    vehicle_no: Optional[str] = None
    driver_name: Optional[str] = None
    eway_bill_no: Optional[str] = None
    invoice_no: Optional[str] = None
    status: str
    scanned_by: Optional[str] = None
    approved_by: Optional[str] = None

    class Config:
        from_attributes = True


class DispatchCreate(BaseModel):
    date: str
    order_no: Optional[str] = None
    customer: str
    lot_no: Optional[str] = None
    quantity_kg: float = Field(..., gt=0)
    vehicle_no: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None


class DispatchStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pending|loading|ready|dispatched|cancelled)$")
    scanned_by: str


class QRScanRequest(BaseModel):
    token: str
    station: str
    scanned_by: str
    location: Optional[str] = None

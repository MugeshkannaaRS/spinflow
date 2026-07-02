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
    total_bags: Optional[int] = None
    total_weight_kg: Optional[float] = None
    # Document fields
    consignee_address: Optional[str] = None
    item_specification: Optional[str] = None
    material_description: Optional[str] = None
    grade: Optional[str] = None
    unit: Optional[str] = None
    pi_do_no: Optional[str] = None
    gross_weight_kg: Optional[float] = None
    tare_weight_kg: Optional[float] = None
    weight_serial: Optional[str] = None
    gate_pass_no: Optional[str] = None
    prepared_by: Optional[str] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class DispatchDocUpdate(BaseModel):
    consignee_address: Optional[str] = None
    item_specification: Optional[str] = None
    material_description: Optional[str] = None
    grade: Optional[str] = None
    unit: Optional[str] = None
    pi_do_no: Optional[str] = None
    total_bags: Optional[int] = None
    gross_weight_kg: Optional[float] = None
    tare_weight_kg: Optional[float] = None
    weight_serial: Optional[str] = None
    gate_pass_no: Optional[str] = None
    prepared_by: Optional[str] = None
    remarks: Optional[str] = None


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

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class TripCreate(BaseModel):
    mill_id: str
    sales_order_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_no: Optional[str] = None
    driver_name: Optional[str] = None
    driver_mobile: Optional[str] = None
    from_warehouse_id: str
    destination_route_id: Optional[str] = None
    destination_name: Optional[str] = None
    customer_id: Optional[str] = None
    planned_bags: int = Field(gt=0)
    planned_weight_kg: float = Field(gt=0)
    bag_ids: List[str] = Field(min_length=1)
    notes: Optional[str] = None


class TripItemOut(BaseModel):
    id: str
    trip_id: str
    bag_no: str
    lot_no: str
    yarn_count: Optional[str] = None
    planned_weight_kg: float = 0.0
    loaded_weight_kg: Optional[float] = None
    delivered_weight_kg: Optional[float] = None
    item_status: str = "pending"
    wrong_destination_detected: bool = False
    loader_scan_at: Optional[datetime] = None
    receiver_scan_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TripOut(BaseModel):
    id: str
    mill_id: str
    trip_no: str
    sales_order_id: Optional[str] = None
    vehicle_id: Optional[str] = None
    vehicle_no: Optional[str] = None
    driver_name: Optional[str] = None
    driver_mobile: Optional[str] = None
    from_warehouse_id: str
    destination_route_id: Optional[str] = None
    destination_name: Optional[str] = None
    customer_id: Optional[str] = None
    status: str = "draft"
    planned_bags: int = 0
    loaded_bags: int = 0
    delivered_bags: int = 0
    planned_weight_kg: float = 0.0
    loaded_weight_kg: float = 0.0
    delivered_weight_kg: float = 0.0
    loader_id: Optional[str] = None
    receiver_id: Optional[str] = None
    loading_started_at: Optional[datetime] = None
    loading_completed_at: Optional[datetime] = None
    departure_at: Optional[datetime] = None
    arrived_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    pod_confirmed_at: Optional[datetime] = None
    pod_confirmed_by: Optional[str] = None
    notes: Optional[str] = None
    created_by: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    items: Optional[List[TripItemOut]] = None

    class Config:
        from_attributes = True


class LoaderScanRequest(BaseModel):
    qr_string: str
    device_info: Optional[str] = None


class ReceiverScanRequest(BaseModel):
    qr_string: str
    scanned_route_id: Optional[str] = None
    device_info: Optional[str] = None


class ScanResult(BaseModel):
    result: str
    bag_no: Optional[str] = None
    lot_no: Optional[str] = None
    yarn_count: Optional[str] = None
    weight_kg: Optional[float] = None
    loaded_count: Optional[int] = None
    planned_count: Optional[int] = None
    trip_complete: Optional[bool] = None
    alert: Optional[str] = None
    expected_route: Optional[str] = None
    scanned_route: Optional[str] = None


class TripScanLogOut(BaseModel):
    id: str
    trip_id: str
    scan_type: str
    result: str
    scanned_by: str
    scanned_at: Optional[datetime] = None
    device_info: Optional[str] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


class TripListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[TripOut]

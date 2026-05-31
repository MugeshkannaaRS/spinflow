from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


class CompanyCreate(BaseModel):
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    gstin: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def validate_gstin(cls, v):
        if not v or str(v).strip() == "":
            return None
        v = str(v).strip().upper()
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
            raise ValueError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)")
        return v


class CompanyUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def validate_gstin(cls, v):
        if not v or str(v).strip() == "":
            return None
        v = str(v).strip().upper()
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
            raise ValueError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)")
        return v


class CompanyOut(BaseModel):
    id: str
    code: str
    name: str
    gstin: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    logo_url: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MillCreate(BaseModel):
    company_id: str
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class MillUpdate(BaseModel):
    company_id: Optional[str] = None
    code: Optional[str] = None
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None


class MillOut(BaseModel):
    id: str
    company_id: str
    code: str
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DepartmentCreate(BaseModel):
    mill_id: str
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    department_type: Optional[str] = "general"


class DepartmentUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    department_type: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentOut(BaseModel):
    id: str
    mill_id: str
    code: str
    name: str
    department_type: str
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class YarnCountCreate(BaseModel):
    mill_id: str
    count: str = Field(..., min_length=1, max_length=20)
    count_value: float = Field(..., gt=0)
    blend: Optional[str] = None
    twist_per_meter: Optional[float] = None
    standard_csp: Optional[float] = None
    standard_u_percent: Optional[float] = None

    @field_validator("count")
    @classmethod
    def validate_count(cls, v: str) -> str:
        if not re.match(r"^\d+s$", v):
            raise ValueError("Count must match pattern like '40s' (digits followed by lowercase 's')")
        return v


class YarnCountUpdate(BaseModel):
    count: Optional[str] = None
    count_value: Optional[float] = None
    blend: Optional[str] = None
    twist_per_meter: Optional[float] = None
    standard_csp: Optional[float] = None
    standard_u_percent: Optional[float] = None
    is_active: Optional[bool] = None

    @field_validator("count")
    @classmethod
    def validate_count(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not re.match(r"^\d+s$", v):
            raise ValueError("Count must match pattern like '40s' (digits followed by lowercase 's')")
        return v


class YarnCountOut(BaseModel):
    id: str
    mill_id: str
    count: str
    count_value: float
    blend: Optional[str] = None
    twist_per_meter: Optional[float] = None
    standard_csp: Optional[float] = None
    standard_u_percent: Optional[float] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class CustomerCreate(BaseModel):
    mill_id: str
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    gstin: Optional[str] = None
    pan: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_limit: Optional[float] = 0
    payment_terms_days: int = 30

    @field_validator("gstin", mode="before")
    @classmethod
    def validate_gstin(cls, v):
        if not v or str(v).strip() == "":
            return None
        v = str(v).strip().upper()
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
            raise ValueError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)")
        return v

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, v):
        if not v or str(v).strip() == "":
            return None
        return str(v).strip()


class CustomerUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    gstin: Optional[str] = None

    @field_validator("gstin", mode="before")
    @classmethod
    def validate_gstin(cls, v):
        if not v or str(v).strip() == "":
            return None
        v = str(v).strip().upper()
        if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
            raise ValueError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)")
        return v

    pan: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_limit: Optional[float] = None
    payment_terms_days: Optional[int] = None
    is_active: Optional[bool] = None


class CustomerOut(BaseModel):
    id: str
    mill_id: str
    code: str
    name: str
    gstin: Optional[str] = None
    pan: Optional[str] = None
    billing_address: Optional[str] = None
    shipping_address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_limit: float = 0
    payment_terms_days: int = 30
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MasterVehicleCreate(BaseModel):
    mill_id: str
    vehicle_no: str = Field(..., min_length=1, max_length=50)
    vehicle_type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    capacity_kg: Optional[float] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_license: Optional[str] = None

    @field_validator("vehicle_no", mode="before")
    @classmethod
    def validate_vehicle_no(cls, v):
        if not v or str(v).strip() == "":
            raise ValueError("Vehicle number is required")
        return str(v).strip()


class MasterVehicleUpdate(BaseModel):
    vehicle_no: Optional[str] = None
    vehicle_type: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    capacity_kg: Optional[float] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_license: Optional[str] = None
    is_active: Optional[bool] = None


class MasterVehicleOut(BaseModel):
    id: str
    mill_id: str
    vehicle_no: str
    vehicle_type: str
    make: Optional[str] = None
    model: Optional[str] = None
    capacity_kg: Optional[float] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_license: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RouteCreate(BaseModel):
    mill_id: str
    code: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=200)
    origin: str = Field(..., min_length=1, max_length=200)
    destination: str = Field(..., min_length=1, max_length=200)
    distance_km: Optional[float] = None
    estimated_hours: Optional[float] = None


class RouteUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    origin: Optional[str] = None
    destination: Optional[str] = None
    distance_km: Optional[float] = None
    estimated_hours: Optional[float] = None
    is_active: Optional[bool] = None


class RouteOut(BaseModel):
    id: str
    mill_id: str
    code: str
    name: str
    origin: str
    destination: str
    distance_km: Optional[float] = None
    estimated_hours: Optional[float] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List

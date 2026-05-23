from pydantic import BaseModel, Field
from typing import Optional


class QualityTestResponse(BaseModel):
    id: str
    date: str
    type: str
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    machine_code: Optional[str] = None
    sample_ref: Optional[str] = None
    result: float
    unit: Optional[str] = None
    standard: float
    status: str
    tested_by: Optional[str] = None

    class Config:
        from_attributes = True


class QualityTestCreate(BaseModel):
    date: str
    type: str
    lot_id: Optional[str] = None
    lot_no: Optional[str] = None
    machine_code: Optional[str] = None
    sample_ref: Optional[str] = None
    result: float
    unit: Optional[str] = None
    standard: float
    tested_by: Optional[str] = None


class QualityApprovalResponse(BaseModel):
    id: str
    lot_id: str
    lot_no: str
    department: str
    produced_kg: float
    sample_date: str
    status: str
    approved_by: Optional[str] = None
    remarks: Optional[str] = None

    class Config:
        from_attributes = True


class QualityApprovalAction(BaseModel):
    lot_id: str
    status: str = Field(..., pattern="^(approved|rejected)$")
    remarks: Optional[str] = None
    approved_by: str

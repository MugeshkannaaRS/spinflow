from pydantic import BaseModel, Field, model_validator, field_validator
from typing import Optional, List
from datetime import date, datetime


class InvoiceCreate(BaseModel):
    party_name: str
    party_gstin: Optional[str] = None
    party_address: Optional[str] = None
    dispatch_id: Optional[str] = None
    invoice_date: date
    due_date: Optional[date] = None
    hsn_code: str = "5509"
    taxable_amount: float = Field(..., gt=0)
    igst_rate: float = Field(default=0.0, ge=0)
    cgst_rate: float = Field(default=9.0, ge=0)
    sgst_rate: float = Field(default=9.0, ge=0)
    transport_charges: float = Field(default=0.0, ge=0)
    other_charges: float = Field(default=0.0, ge=0)
    remarks: Optional[str] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None

    @model_validator(mode="after")
    def compute_amounts(self):
        self.tax_amount = self.taxable_amount * (self.igst_rate + self.cgst_rate + self.sgst_rate) / 100
        self.total_amount = self.taxable_amount + self.tax_amount + self.transport_charges + self.other_charges
        return self


class InvoiceOut(BaseModel):
    id: str
    invoice_no: Optional[str] = None
    party_name: Optional[str] = None
    party_gstin: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    taxable_amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    transport_charges: Optional[float] = None
    other_charges: Optional[float] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class InvoiceListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[InvoiceOut]


class PaymentCreate(BaseModel):
    invoice_id: str
    amount: float = Field(..., gt=0)
    payment_date: date
    payment_mode: str
    reference_no: Optional[str] = None
    remarks: Optional[str] = None

    @field_validator("payment_mode")
    @classmethod
    def validate_payment_mode(cls, v: str) -> str:
        allowed = {"NEFT", "RTGS", "Cheque", "Cash", "UPI"}
        if v not in allowed:
            raise ValueError(f"payment_mode must be one of {allowed}")
        return v


class PaymentOut(BaseModel):
    id: str
    invoice_id: str
    amount: float
    payment_date: Optional[date] = None
    payment_mode: Optional[str] = None
    reference_no: Optional[str] = None
    remarks: Optional[str] = None
    recorded_by: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AccountsSummary(BaseModel):
    total_invoiced: float = 0.0
    total_received: float = 0.0
    total_outstanding: float = 0.0
    overdue_count: int = 0
    overdue_amount: float = 0.0

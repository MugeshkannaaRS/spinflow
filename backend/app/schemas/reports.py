from pydantic import BaseModel, model_validator
from typing import Optional, List, Dict
from datetime import date, datetime


class DateRangeQuery(BaseModel):
    date_from: date
    date_to: date

    @model_validator(mode="after")
    def validate_range(self):
        if self.date_to < self.date_from:
            raise ValueError("date_to must be on or after date_from")
        delta = (self.date_to - self.date_from).days
        if delta > 90:
            raise ValueError("Date range cannot exceed 90 days")
        return self


class ProductionReportRow(BaseModel):
    date: str
    department: str
    production_kg: float
    target_kg: float
    efficiency_pct: float
    waste_kg: float
    waste_pct: float


class ProductionReport(BaseModel):
    generated_at: datetime
    date_from: date
    date_to: date
    rows: List[ProductionReportRow]
    totals: Dict[str, float]


class QualityReportRow(BaseModel):
    lot_no: str
    count: str
    csp: Optional[float] = None
    u_percent: Optional[float] = None
    result: str
    tested_by: str
    tested_at: datetime


class QualityReport(BaseModel):
    generated_at: datetime
    date_from: date
    date_to: date
    total_tests: int
    pass_rate_pct: float
    rows: List[QualityReportRow]


class DispatchReportRow(BaseModel):
    dispatch_no: str
    customer_name: str
    dispatch_date: Optional[str] = None
    total_bags: int
    total_weight_kg: float
    status: str


class DispatchReport(BaseModel):
    generated_at: datetime
    date_from: date
    date_to: date
    total_dispatches: int
    total_weight_kg: float
    rows: List[DispatchReportRow]


class KPIDashboard(BaseModel):
    production_today: float = 0.0
    target_today: float = 0.0
    efficiency_pct: float = 0.0
    waste_pct: float = 0.0
    active_downtime_machines: int = 0
    pending_approvals: int = 0
    lots_pending_qc: int = 0
    dispatches_today: int = 0
    revenue_month: float = 0.0
    outstanding_amount: float = 0.0

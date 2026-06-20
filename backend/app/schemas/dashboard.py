from pydantic import BaseModel


class MillSummary(BaseModel):
    mill_id: str
    mill_name: str
    mill_code: str
    production_kg_today: float
    efficiency_pct: float
    active_machines: int
    total_machines: int
    employees_active: int
    present_today: int
    balance_kg: float
    dispatch_kg_today: float
    open_alerts: int


class OwnerDashboardResponse(BaseModel):
    mills: list[MillSummary]
    total_production_kg_today: float
    avg_efficiency_pct: float
    total_active_machines: int
    total_machines: int
    total_employees: int
    total_present_today: int
    total_balance_kg: float
    total_dispatch_kg_today: float
    total_open_alerts: int

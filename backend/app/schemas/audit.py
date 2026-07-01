from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str] = None
    role: Optional[str] = None
    action_type: Optional[str] = None
    module: Optional[str] = None
    record_id: Optional[str] = None
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    timestamp: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int
    data: List[AuditLogOut]


class AuditFilterParams(BaseModel):
    module: Optional[str] = None
    action_type: Optional[str] = None
    user_id: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    record_id: Optional[str] = None

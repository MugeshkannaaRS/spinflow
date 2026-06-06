from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from typing import List, Optional

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, get_mill_scope
from app.models.user import User
from app.models.audit import AuditLog
from app.models.masters import Mill
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: str
    timestamp: str
    user_name: Optional[str] = None
    role: Optional[str] = None
    action: str
    entity: str
    entity_id: Optional[str] = None
    details: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    ip_address: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/audit/logs")
async def get_audit_logs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("audit")),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = None,
    entity: Optional[str] = None,
    entity_id: Optional[str] = None,
):
    try:
        scope = await get_mill_scope(current_user, db)
        query = (
            select(AuditLog, User.name.label("resolved_user_name"))
            .outerjoin(User, AuditLog.user_id == User.id)
            .where(AuditLog.action.isnot(None))
        )
        if scope["mill_id"]:
            query = query.where(User.mill_id == scope["mill_id"])
        elif scope["company_id"]:
            query = query.join(Mill, AuditLog.user_id == User.id).join(Mill, User.mill_id == Mill.id).where(Mill.company_id == scope["company_id"])
        query = query.order_by(desc(AuditLog.created_at))
        if action:
            query = query.where(AuditLog.action == action)
        if entity:
            query = query.where(AuditLog.entity == entity)
        if entity_id:
            query = query.where(AuditLog.entity_id == entity_id)
        count_stmt = select(func.count()).select_from(query.subquery())
        total = (await db.execute(count_stmt)).scalar() or 0
        query = query.offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        logs = result.scalars().all()
        items = [
            AuditLogResponse(
                id=log.AuditLog.id,
                timestamp=log.AuditLog.created_at.isoformat() if log.AuditLog.created_at else "",
                user_name=log.resolved_user_name or log.AuditLog.user_name or "System",
                role=log.AuditLog.role,
                action=log.AuditLog.action,
                entity=log.AuditLog.entity,
                entity_id=log.AuditLog.entity_id,
                details=log.AuditLog.details,
                old_value=log.AuditLog.old_value,
                new_value=log.AuditLog.new_value,
                ip_address=log.AuditLog.ip_address,
            )
            for log in logs
        ]
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": items,
        }
    except Exception:
        return {"items": [], "total": 0, "page": 1, "pages": 0}

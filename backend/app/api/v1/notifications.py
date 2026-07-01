"""Notifications API — Wave 4A.

Endpoints:
  GET    /notifications              — list my notifications (paginated)
  GET    /notifications/unread-count — fast badge counter
  PATCH  /notifications/{id}/read   — mark one read
  POST   /notifications/read-all    — mark all read
  DELETE /notifications/{id}        — archive (soft)
  POST   /notifications             — create (MILL_OWNER / SUPER_ADMIN)
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from typing import Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.alerts import Notification
from app.services.notification_service import (
    create_notification,
    mark_read,
    mark_all_read,
    archive_notification,
    get_unread_count,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response schema
# ---------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: str
    title: str
    message: Optional[str] = None
    severity: str
    category: str
    priority: str
    icon: Optional[str] = None
    action_url: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    is_read: bool
    is_archived: bool
    created_at: str
    read_at: Optional[str] = None

    class Config:
        from_attributes = True


def _to_resp(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=n.id,
        title=n.title,
        message=n.message,
        severity=n.severity,
        category=n.category,
        priority=n.priority,
        icon=n.icon,
        action_url=n.action_url,
        source_type=n.source_type,
        source_id=n.source_id,
        is_read=n.is_read,
        is_archived=n.is_archived,
        created_at=n.created_at.isoformat() if n.created_at else "",
        read_at=n.read_at.isoformat() if n.read_at else None,
    )


# ---------------------------------------------------------------------------
# GET /notifications/unread-count
# ---------------------------------------------------------------------------

@router.get("/notifications/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await get_unread_count(db, str(current_user.id))
    return {"unread_count": count}


# ---------------------------------------------------------------------------
# GET /notifications
# ---------------------------------------------------------------------------

@router.get("/notifications")
async def list_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unread_only: bool = False,
    include_archived: bool = False,
    category: Optional[str] = None,
):
    user_id = str(current_user.id)

    query = select(Notification).where(Notification.user_id == user_id)
    if not include_archived:
        query = query.where(Notification.is_archived == False)
    if unread_only:
        query = query.where(Notification.is_read == False)
    if category:
        query = query.where(Notification.category == category)

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    query = query.order_by(desc(Notification.created_at))
    query = query.offset((page - 1) * page_size).limit(page_size)
    items = (await db.execute(query)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        "data": [_to_resp(n) for n in items],
    }


# ---------------------------------------------------------------------------
# PATCH /notifications/{id}/read
# ---------------------------------------------------------------------------

@router.patch("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await mark_read(db, str(current_user.id), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# POST /notifications/read-all
# ---------------------------------------------------------------------------

@router.post("/notifications/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await mark_all_read(db, str(current_user.id))
    await db.commit()
    return {"success": True, "marked_read": count}


# ---------------------------------------------------------------------------
# DELETE /notifications/{id}  (archive)
# ---------------------------------------------------------------------------

@router.delete("/notifications/{notification_id}")
async def archive_notification_endpoint(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await archive_notification(db, str(current_user.id), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Notification not found")
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# POST /notifications  (MILL_OWNER / SUPER_ADMIN only)
# ---------------------------------------------------------------------------

class CreateNotificationBody(BaseModel):
    user_id: str
    title: str
    message: Optional[str] = None
    severity: str = "INFO"
    category: str = "SYSTEM"
    priority: str = "MEDIUM"
    icon: Optional[str] = None
    action_url: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    metadata: Optional[dict] = None


@router.post("/notifications", status_code=201)
async def create_notification_endpoint(
    body: CreateNotificationBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Only MILL_OWNER or SUPER_ADMIN can create notifications")

    company_id = str(current_user.company_id) if current_user.company_id else None
    if not company_id and role_code != "SUPER_ADMIN":
        raise HTTPException(status_code=400, detail="No company context")

    # SUPER_ADMIN can target any company; look up target user's company
    if role_code == "SUPER_ADMIN":
        target = await db.get(User, body.user_id)
        if not target:
            raise HTTPException(status_code=404, detail="Target user not found")
        company_id = str(target.company_id) if target.company_id else company_id

    notif = await create_notification(
        db,
        company_id=company_id,
        user_id=body.user_id,
        title=body.title,
        message=body.message,
        severity=body.severity,
        category=body.category,
        priority=body.priority,
        icon=body.icon,
        action_url=body.action_url,
        source_type=body.source_type,
        source_id=body.source_id,
        metadata=body.metadata,
    )
    await db.commit()
    return _to_resp(notif)

"""Notification service — Wave 4A.

Handles DB-persisted notifications with WebSocket push-through.
All public helpers accept db + plain IDs (no current_user dependency)
so they can be called from background tasks, alert engine, and API endpoints.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerts import Notification
from app.models.user import User

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Create a single notification for one user
# ---------------------------------------------------------------------------

async def create_notification(
    db: AsyncSession,
    *,
    company_id: str,
    user_id: str,
    title: str,
    message: Optional[str] = None,
    severity: str = "INFO",
    category: str = "SYSTEM",
    icon: Optional[str] = None,
    action_url: Optional[str] = None,
    priority: str = "MEDIUM",
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    mill_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    push_ws: bool = True,
) -> Notification:
    """Persist a notification and optionally push it via WebSocket."""
    notif = Notification(
        company_id=company_id,
        user_id=user_id,
        mill_id=mill_id,
        title=title,
        message=message,
        severity=severity,
        category=category,
        icon=icon,
        action_url=action_url,
        priority=priority,
        source_type=source_type,
        source_id=source_id,
        metadata_json=metadata or {},
    )
    db.add(notif)
    await db.flush()

    if push_ws:
        try:
            from app.ws.notifications import manager
            await manager.send_to_user(user_id, {
                "type": "notification",
                "id": notif.id,
                "title": title,
                "message": message,
                "severity": severity,
                "category": category,
                "priority": priority,
                "action_url": action_url,
                "timestamp": notif.created_at.isoformat() if notif.created_at else datetime.utcnow().isoformat(),
            })
        except Exception as e:
            logger.debug("WS push failed (non-fatal): %s", e)

    return notif


# ---------------------------------------------------------------------------
# Notify all users with a given role in a company
# ---------------------------------------------------------------------------

async def notify_role(
    db: AsyncSession,
    *,
    company_id: str,
    role_code: str,
    title: str,
    message: Optional[str] = None,
    severity: str = "WARNING",
    category: str = "SYSTEM",
    icon: Optional[str] = None,
    action_url: Optional[str] = None,
    priority: str = "MEDIUM",
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    mill_id: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> list[Notification]:
    """Create one notification for every active user in the given role+company."""
    from app.models.user import Role

    # Resolve role id from code
    role_res = await db.execute(select(Role).where(Role.code == role_code))
    role_obj = role_res.scalar_one_or_none()
    if not role_obj:
        logger.warning("notify_role: role %s not found", role_code)
        return []

    users_res = await db.execute(
        select(User).where(
            User.company_id == company_id,
            User.role_id == role_obj.id,
            User.is_active == True,
            User.deleted_at.is_(None),
        )
    )
    users = users_res.scalars().all()

    notifications = []
    for user in users:
        notif = await create_notification(
            db,
            company_id=company_id,
            user_id=str(user.id),
            title=title,
            message=message,
            severity=severity,
            category=category,
            icon=icon,
            action_url=action_url,
            priority=priority,
            source_type=source_type,
            source_id=source_id,
            mill_id=mill_id,
            metadata=metadata,
            push_ws=True,
        )
        notifications.append(notif)

    return notifications


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

async def get_unread_count(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count()).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
            Notification.is_archived == False,
        )
    )
    return result.scalar() or 0


# ---------------------------------------------------------------------------
# Mark-read helpers
# ---------------------------------------------------------------------------

async def mark_read(db: AsyncSession, user_id: str, notification_id: str) -> bool:
    """Mark a single notification as read. Returns False if not found / not owned."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        return False
    if not notif.is_read:
        notif.is_read = True
        notif.read_at = datetime.utcnow()
    return True


async def mark_all_read(db: AsyncSession, user_id: str) -> int:
    """Mark all unread notifications as read. Returns number updated."""
    result = await db.execute(
        update(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.utcnow())
    )
    return result.rowcount or 0


async def archive_notification(db: AsyncSession, user_id: str, notification_id: str) -> bool:
    """Soft-archive a notification. Returns False if not found / not owned."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user_id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        return False
    notif.is_archived = True
    return True

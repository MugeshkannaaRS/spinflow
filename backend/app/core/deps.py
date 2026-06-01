from fastapi import Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.audit import AuditLog
from app.models.masters import Mill
from app.core.rbac import can_access, can_write
from sqlalchemy import select
from sqlalchemy.orm import selectinload
import uuid


def _extract_ip(request: Request) -> str:
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


async def get_current_user(
    request: Request,
    authorization: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid token")
    token = authorization.split(" ")[1]
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    result = await db.execute(select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    allowed_paths = ("/auth/change-password", "/auth/me", "/auth/logout")
    if user.must_change_password and not any(request.url.path.endswith(p) for p in allowed_paths):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "MUST_CHANGE_PASSWORD", "message": "Please change your password to continue"},
        )

    user._current_ip = _extract_ip(request)
    return user


def require_module(module: str, write: bool = False):
    async def dependency(current_user: User = Depends(get_current_user)) -> User:
        role = current_user.role_rel.code if current_user.role_rel else None
        if not role:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No role assigned")
        if role == "SUPER_ADMIN":
            return current_user
        if write:
            if not can_write(role, module):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Write access denied for module: {module}")
        else:
            if not can_access(role, module):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied for module: {module}")
        return current_user
    return dependency


async def get_mill_scope(current_user: User = Depends(get_current_user)):
    role_name = current_user.role
    if role_name == "SUPER_ADMIN":
        return {"mill_id": None, "company_id": None, "role": role_name}
    if role_name == "MILL_OWNER":
        return {"mill_id": None, "company_id": current_user.company_id, "role": role_name}
    return {"mill_id": current_user.mill_id, "company_id": current_user.company_id, "role": role_name}


async def log_audit(
    db: AsyncSession,
    user_id: str,
    role: str,
    action: str,
    entity: str,
    entity_id: str,
    details: str,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> AuditLog:
    log = AuditLog(
        user_id=user_id,
        role=role,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details,
        old_value=old_value,
        new_value=new_value,
        ip_address=ip_address or "0.0.0.0",
    )
    db.add(log)
    await db.commit()
    return log

from fastapi import Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.audit import AuditLog
from app.models.masters import Mill
from app.core.rbac import can_access, can_write
from app.models.masters import CompanyModule
from app.models.user import Role
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


ROLE_MODULE_ACCESS = {
    "MILL_OWNER": ["dashboard","production","quality","maintenance","hr",
                   "payroll","purchase","stores","inventory","dispatch",
                   "lotrac","accounts","sales","masters","users",
                   "reports","column_config","whatsapp","lc_tracking",
                   "analytics"],
    "GENERAL_MANAGER": ["dashboard","production","quality","maintenance",
                        "hr","payroll","purchase","stores","inventory",
                        "dispatch","accounts","sales","masters","reports",
                        "lotrac","lc_tracking","analytics"],
    "PRODUCTION_MANAGER": ["dashboard","production","quality",
                           "maintenance","reports","analytics"],
    "QUALITY_MANAGER": ["dashboard","quality","production","reports"],
    "DISPATCH_MANAGER": ["dashboard","dispatch","lotrac","stores",
                         "inventory","reports"],
    "STORE_MANAGER": ["dashboard","stores","inventory","purchase",
                      "maintenance","reports"],
    "HR_MANAGER": ["dashboard","hr","payroll","reports"],
    "ACCOUNTANT": ["dashboard","accounts","sales","payroll","purchase",
                   "reports","lc_tracking"],
    "MAINTENANCE_MANAGER": ["dashboard","maintenance","stores","reports"],
    "SUPERVISOR": ["dashboard","production","reports"],
    "MACHINE_OPERATOR": ["dashboard"],
    "SECURITY_GATE": ["dashboard"],
    "AUDITOR": ["dashboard","production","quality","hr","accounts",
                "reports"],
}

SYSTEM_MODULES = {"dashboard","masters","users","column_config","audit"}

def require_module(module: str, write: bool = False):
    async def dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        role_result = await db.execute(
            select(Role).where(Role.id == current_user.role_id)
        )
        role = role_result.scalar_one_or_none()
        role_code = role.code if role else "MACHINE_OPERATOR"

        if role_code == "SUPER_ADMIN":
            return current_user

        allowed_by_role = module in ROLE_MODULE_ACCESS.get(role_code, ["dashboard"])
        if not allowed_by_role:
            raise HTTPException(
                status_code=403,
                detail=f"Your role ({role_code}) does not have access to this module. Contact your administrator if you need access."
            )

        if write and not can_write(role_code, module):
            raise HTTPException(
                status_code=403,
                detail=f"Write access denied for module: {module}"
            )

        if module in SYSTEM_MODULES:
            return current_user

        if current_user.company_id:
            cm_result = await db.execute(
                select(CompanyModule).where(
                    CompanyModule.company_id == current_user.company_id,
                    CompanyModule.module_name == module,
                    CompanyModule.is_enabled == True
                )
            )
            if not cm_result.scalar_one_or_none():
                raise HTTPException(
                    status_code=403,
                    detail=f"Module '{module}' is not enabled for your company. Contact SpinFlow support to upgrade your plan."
                )

        return current_user
    return dependency


async def get_mill_scope(current_user: User = Depends(get_current_user)):
    role_name = current_user.role
    if role_name == "SUPER_ADMIN":
        return {"mill_id": None, "company_id": None, "role": role_name, "see_all_company_mills": False}
    if role_name == "MILL_OWNER":
        return {"mill_id": current_user.mill_id, "company_id": current_user.company_id, "role": role_name, "see_all_company_mills": True}
    return {"mill_id": current_user.mill_id, "company_id": current_user.company_id, "role": role_name, "see_all_company_mills": False}


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

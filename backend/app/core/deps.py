from fastapi import Depends, HTTPException, status, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.db.session import get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.audit import AuditLog
from app.models.masters import Company, Mill
from app.core.access import resolve_access
from app.core.rbac import SYSTEM_MODULES, is_dashboard_only
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
    result = await db.execute(
        select(User).options(selectinload(User.role_rel)).where(User.id == user_id, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    if user.company_id:
        company = await db.get(Company, user.company_id)
        if company and company.status == "suspended":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Company account is suspended")

    allowed_paths = ("/auth/change-password", "/auth/me", "/auth/logout")
    if user.must_change_password and not any(request.url.path.endswith(p) for p in allowed_paths):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "MUST_CHANGE_PASSWORD", "message": "Please change your password to continue"},
        )

    user._current_ip = _extract_ip(request)
    return user


_ALWAYS_ALLOWED: dict[str, set[str]] = {
    "users":         {"SUPER_ADMIN", "MILL_OWNER"},
    "masters":       {"SUPER_ADMIN", "MILL_OWNER"},
    "column_config": {"SUPER_ADMIN"},
    "dashboard":     set(),  # handled by resolve_access
}


def require_module(module: str, write: bool = False):
    """Three-layer permission guard.

    Evaluates:
      1. ALWAYS_ALLOWED bypass (SUPER_ADMIN / MILL_OWNER on users+masters)
      2. Company subscription (company_modules)
      3. Role capability (ACCESS_MATRIX)
      4. User module restrictions (module_restrictions)
    """
    async def dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
        always = _ALWAYS_ALLOWED.get(module, set())
        if role_code in always or role_code == "SUPER_ADMIN":
            return current_user
        result = await resolve_access(db, current_user, module, write=write)
        if not result.granted:
            raise HTTPException(status_code=403, detail=result.reason)
        return current_user
    return dependency


async def get_mill_scope(
    current_user: User,
    db: Optional[AsyncSession] = None,
):
    """Returns the data scope for the current user.

    SUPER_ADMIN: sees everything (mill_id=None, company_id=None)
    MILL_OWNER:  sees all mills in their company (see_all_company_mills=True)
    All others:  scoped to their assigned mill

    Falls back to a DB lookup to derive company_id from mill_id when
    the user record has no company_id set directly (e.g. MILL_OWNER
    created via import without explicit company_id).
    """
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code == "SUPER_ADMIN":
        return {
            "mill_id": None,
            "company_id": None,
            "role": role_code,
            "see_all_company_mills": False,
        }

    company_id = str(current_user.company_id) if current_user.company_id else None

    # Fallback: derive company_id from mill when not stored on user
    if not company_id and current_user.mill_id and db is not None:
        try:
            r = await db.execute(select(Mill).where(Mill.id == current_user.mill_id))
            m = r.scalar_one_or_none()
            if m and m.company_id:
                company_id = str(m.company_id)
        except Exception:
            pass

    if role_code == "MILL_OWNER":
        return {
            "mill_id": None,  # MILL_OWNER sees all mills in their company
            "company_id": company_id,
            "role": role_code,
            "see_all_company_mills": True,
        }
    return {
        "mill_id": current_user.mill_id,
        "company_id": company_id,
        "role": role_code,
        "see_all_company_mills": False,
    }


async def log_audit(
    db: AsyncSession,
    user_id: Optional[str],
    role: str,
    action: str,
    entity: str,
    entity_id: str,
    details: str,
    old_value: Optional[str] = None,
    new_value: Optional[str] = None,
    ip_address: Optional[str] = None,
    # Wave 4A — enrichment params (all optional, backward-compatible)
    category: Optional[str] = None,
    severity: Optional[str] = None,
    entity_name: Optional[str] = None,
    mill_name: Optional[str] = None,
    company_name: Optional[str] = None,
    company_id: Optional[str] = None,
    mill_id: Optional[str] = None,
    module: Optional[str] = None,
    metadata_json: Optional[dict] = None,
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
        category=category or "USER_ACTIVITY",
        severity=severity or "INFO",
        entity_name=entity_name,
        mill_name=mill_name,
        company_name=company_name,
        company_id=company_id,
        mill_id=mill_id,
        module=module,
        metadata_json=metadata_json,
    )
    db.add(log)
    await db.flush()
    return log

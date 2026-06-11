"""Three-layer permission resolver.

LAYER 1 — Company Subscription  (company_modules.is_enabled)
LAYER 2 — Role Capability       (ACCESS_MATRIX in rbac.py)
LAYER 3 — User Module Assignment (user_modules.is_enabled)

ACCESS = Layer1 AND Layer2 AND Layer3

Every API endpoint uses resolve_access() — no exceptions except SUPER_ADMIN.
"""

from dataclasses import dataclass
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.masters import CompanyModule, RoleModuleAccess
from app.core.rbac import (
    can_access as role_can_access,
    can_write as role_can_write,
    SYSTEM_MODULES,
)


@dataclass
class AccessResult:
    granted: bool
    reason: str = ""
    level: str = ""  # "none" | "read" | "write"


GRANTED = AccessResult(granted=True, reason="ok")
SYSTEM_BYPASS = AccessResult(granted=True, reason="system module — always accessible")
SUPER_ADMIN_BYPASS = AccessResult(granted=True, reason="super admin — unrestricted")


async def resolve_access(
    db: AsyncSession,
    user: User,
    module: str,
    write: bool = False,
    *,
    skip_company_check: bool = False,
) -> AccessResult:
    """Three-layer permission check.

    Args:
        db: Database session.
        user: Current authenticated user (must have role_rel loaded).
        module: Module name (e.g. "production", "hr").
        write: If True, requires write access.
        skip_company_check: Bypass company subscription check (for platform SUPER_ADMIN).

    Returns:
        AccessResult with granted, reason, level.
    """
    role_code = user.role

    # ── SUPER_ADMIN: bypass everything ──────────────────────────────────────
    if role_code == "SUPER_ADMIN":
        return SUPER_ADMIN_BYPASS

    # ── LAYER 2: Role capability ────────────────────────────────────────────
    if not role_can_access(role_code, module):
        return AccessResult(
            granted=False,
            reason=f"Your role ({role_code}) does not have access to '{module}'.",
            level="none",
        )

    access_level = "read" if role_can_write(role_code, module) else "readonly"
    if write and not role_can_write(role_code, module):
        return AccessResult(
            granted=False,
            reason=f"Write access denied for '{module}'. Your role ({role_code}) has read-only access.",
            level="readonly",
        )

    # ── LAYER 1: Company subscription ───────────────────────────────────────
    if not skip_company_check and module not in SYSTEM_MODULES and user.company_id:
        stmt = select(CompanyModule).where(
            CompanyModule.company_id == user.company_id,
            CompanyModule.module_name == module,
            CompanyModule.is_enabled == True,
        )
        result = await db.execute(stmt)
        cm = result.scalar_one_or_none()
        if not cm:
            return AccessResult(
                granted=False,
                reason=f"Module '{module}' is not enabled for your company. Contact SpinFlow support.",
                level="none",
            )

    # ── LAYER 3: Per-company role-module overrides ──────────────────────────
    # SUPER_ADMIN can grant or revoke module access for a specific role within
    # a company. A missing row = use system default (already evaluated above).
    if not skip_company_check and user.company_id:
        override_res = await db.execute(
            select(RoleModuleAccess).where(
                RoleModuleAccess.company_id == user.company_id,
                RoleModuleAccess.role_code == role_code,
                RoleModuleAccess.module_name == module,
            )
        )
        override = override_res.scalar_one_or_none()
        if override is not None:
            if not override.is_allowed:
                return AccessResult(
                    granted=False,
                    reason=f"Module '{module}' has been restricted for your role by your company admin.",
                    level="none",
                )
            # is_allowed=True overrides a role that normally can't access the module
            access_level = "read"

    # ── LAYER 4: User module restrictions ────────────────────────────────────
    # User-level module restrictions can only REDUCE access.
    # If module_restrictions has an explicit entry for this module, respect it.
    # If no entry exists, role-level access stands.
    user_restrictions = user.get_module_restrictions()
    if user_restrictions and not skip_company_check:
        if module in user_restrictions:
            if not user_restrictions[module]:
                return AccessResult(
                    granted=False,
                    reason=f"Module '{module}' has been restricted for this user.",
                    level="none",
                )

    return AccessResult(granted=True, reason="ok", level=access_level)

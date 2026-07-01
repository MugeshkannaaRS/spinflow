"""Four-layer permission resolver.

ORDER (highest priority first):
  1. CompanySubscription  — hard gate; module must be enabled for company
  2. SUPER_ADMIN          — full bypass
  3. UserModuleAccess     — per-user override (if row exists, FINAL)
  4. RoleModuleAccess     — per-company role-level override
  5. ACCESS_MATRIX        — hardcoded role default

Every API endpoint uses resolve_access() — no exceptions except SUPER_ADMIN.
"""

from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User, UserModuleAccess
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
    """Resolve module access through the priority chain.

    Args:
        db: Database session.
        user: Current authenticated user (must have role_rel loaded).
        module: Module name (e.g. "production", "hr").
        write: If True, requires write access.
        skip_company_check: Bypass company subscription check (for platform SUPER_ADMIN).

    Returns:
        AccessResult with granted, reason, level.
    """
    role_code = user.role_rel.code if user.role_rel else (user.role or "")

    # ── LAYER 1: Company subscription (hard gate) ────────────────────────────
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

    # ── LAYER 2: SUPER_ADMIN bypass ──────────────────────────────────────────
    if role_code == "SUPER_ADMIN":
        return SUPER_ADMIN_BYPASS

    # ── LAYER 3: Per-user module override (UserModuleAccess) ─────────────────
    # If an explicit row exists for this user+module, its access_level is
    # FINAL — no fall-through to role defaults.
    #   'write' → read+write, overrides role default completely
    #   'read'  → read-only, capped even if role would give write
    #   'none'  → explicitly denied, overrides role grant
    uma_res = await db.execute(
        select(UserModuleAccess).where(
            UserModuleAccess.user_id == user.id,
            UserModuleAccess.module == module,
        )
    )
    uma = uma_res.scalar_one_or_none()
    if uma is not None:
        if uma.access_level == "write":
            return AccessResult(granted=True, reason="ok", level="write")
        if uma.access_level == "read":
            if write:
                return AccessResult(
                    granted=False,
                    reason=f"Write access denied for '{module}'. This user has read-only access.",
                    level="read",
                )
            return AccessResult(granted=True, reason="ok", level="read")
        # access_level == "none"
        return AccessResult(
            granted=False,
            reason=f"Module '{module}' has been disabled for this user by Super Admin.",
            level="none",
        )

    # ── LAYER 4: Role capability (ACCESS_MATRIX) ────────────────────────────
    if not role_can_access(role_code, module):
        return AccessResult(
            granted=False,
            reason=f"Your role ({role_code}) does not have access to '{module}'.",
            level="none",
        )

    access_level = "write" if role_can_write(role_code, module) else "read"
    if write and access_level != "write":
        return AccessResult(
            granted=False,
            reason=f"Write access denied for '{module}'. Your role ({role_code}) has read-only access.",
            level="readonly",
        )

    # ── LAYER 5: Per-company role-module overrides (RoleModuleAccess) ────────
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
            if not write:
                access_level = "read"
            elif role_can_write(role_code, module):
                access_level = "write"
            else:
                access_level = "read"

    # ── LAYER 6: Legacy module_restrictions JSON column (backward compat) ────
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

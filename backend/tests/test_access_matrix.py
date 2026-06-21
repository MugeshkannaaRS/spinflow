"""Access matrix validation — 3-layer permission checks.

Verifies:
  Layer 1 — Company subscription (company_modules)
  Layer 2 — Role capability (ACCESS_MATRIX)
  Layer 3 — User module restrictions (module_restrictions)

  ACCESS = Layer1 AND Layer2 AND Layer3

  SUPER_ADMIN bypasses all layers.
  MILL_OWNER has full write access to ALL modules.
"""

import uuid
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.user import User, Role, UserModuleAccess
from app.models.masters import Company, CompanyModule
from app.core.access import resolve_access
from app.core.rbac import ACCESS_MATRIX


def _get_expected_level(role: str, module: str) -> str:
    if role == "SUPER_ADMIN":
        return "write"
    return ACCESS_MATRIX.get(role, {}).get(module, "none")


async def _get_or_create_role(session: AsyncSession, role_code: str) -> Role:
    existing = await session.execute(
        select(Role).where(Role.code == role_code)
    )
    role = existing.scalar_one_or_none()
    if role:
        return role
    role = Role(id=str(uuid.uuid4()), code=role_code, name=role_code, is_system=True)
    session.add(role)
    await session.flush()
    return role


async def _create_user(session: AsyncSession, role_code: str, company_id: Optional[str] = None) -> User:
    role = await _get_or_create_role(session, role_code)
    email = f"{role_code.lower()}_{uuid.uuid4().hex[:8]}@test.com"
    user = User(
        id=str(uuid.uuid4()), name=role_code, email=email,
        password_hash="hash", role_id=role.id,
        company_id=company_id,
        is_active=True,
    )
    user.role_rel = role
    session.add(user)
    await session.flush()
    # Eagerly load role_rel before passing to resolve_access
    result = await session.execute(
        select(User).options(selectinload(User.role_rel)).where(User.id == user.id)
    )
    return result.scalar_one()


async def _ensure_company_module(session: AsyncSession, company_id: str, module: str, enabled: bool = True):
    existing = await session.execute(
        select(CompanyModule).where(
            CompanyModule.company_id == company_id,
            CompanyModule.module_name == module,
        )
    )
    cm = existing.scalar_one_or_none()
    if cm:
        cm.is_enabled = enabled
    else:
        session.add(CompanyModule(company_id=company_id, module_name=module, is_enabled=enabled))
    await session.flush()


# ── Test 1: SUPER_ADMIN bypasses everything ─────────────────────────────────


async def test_super_admin_bypasses_all_layers(session: AsyncSession):
    """SUPER_ADMIN always gets access, regardless of module."""
    user = await _create_user(session, "SUPER_ADMIN")
    result = await resolve_access(session, user, "anything_unlocked", write=True)
    assert result.granted, "SUPER_ADMIN should bypass all checks"


# ── Test 2: Layer 2 — Role capability ───────────────────────────────────────


async def test_role_without_module_denied(session: AsyncSession):
    """MACHINE_OPERATOR cannot access quality (read-only role shows denied for write)."""
    user = await _create_user(session, "MACHINE_OPERATOR")
    result = await resolve_access(session, user, "quality")
    assert not result.granted, "MACHINE_OPERATOR should not write quality"


async def test_role_with_module_allowed(session: AsyncSession):
    """PRODUCTION_MANAGER can access production (by role)."""
    user = await _create_user(session, "PRODUCTION_MANAGER")
    result_bare = await resolve_access(session, user, "production", skip_company_check=True)
    assert result_bare.granted, "PRODUCTION_MANAGER should have production access by role"


async def test_write_access_denied_for_readonly(session: AsyncSession):
    """GENERAL_MANAGER can read accounts but not write."""
    user = await _create_user(session, "GENERAL_MANAGER")
    result = await resolve_access(session, user, "accounts", write=True, skip_company_check=True)
    assert not result.granted, "GENERAL_MANAGER cannot write to accounts"


async def test_read_access_allowed_for_readonly(session: AsyncSession):
    """GENERAL_MANAGER can read accounts."""
    user = await _create_user(session, "GENERAL_MANAGER")
    result = await resolve_access(session, user, "accounts", write=False, skip_company_check=True)
    assert result.granted, "GENERAL_MANAGER can read accounts"


# ── Test 3: Layer 1 — Company subscription ──────────────────────────────────


async def test_disabled_company_module_denied(session: AsyncSession):
    """With company module disabled, role access is denied."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=False)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    result = await resolve_access(session, user, "production")
    assert not result.granted, "Disabled company module should deny access"


async def test_enabled_company_module_allowed(session: AsyncSession):
    """With company module enabled, role access is allowed."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO2", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    result = await resolve_access(session, user, "production")
    assert result.granted, "Enabled company module should allow access"


async def test_no_company_module_entry_denied(session: AsyncSession):
    """No CompanyModule entry at all should deny access."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO3", is_active=True)
    session.add(company)
    await session.flush()
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    result = await resolve_access(session, user, "quality")
    assert not result.granted, "Missing company module entry should deny access"


# ── Test 4: Layer 3 — User module restrictions ──────────────────────────────


async def test_user_restriction_blocks_enabled_module(session: AsyncSession):
    """User restriction blocks even if company and role allow."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO4", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    user.module_restrictions = {"production": False}
    await session.flush()
    result = await resolve_access(session, user, "production")
    assert not result.granted, "User restriction should block even with role+company access"


async def test_user_restriction_allows_unrestricted_module(session: AsyncSession):
    """User restriction for module X should not affect module Y."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO5", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    await _ensure_company_module(session, company.id, "quality", enabled=True)
    user = await _create_user(session, "QUALITY_MANAGER", company_id=company.id)
    user.module_restrictions = {"production": False}
    await session.flush()
    result = await resolve_access(session, user, "quality")
    assert result.granted, "Quality should still be allowed"


async def test_user_restriction_does_not_affect_other_roles(session: AsyncSession):
    """User restriction on one user should not affect another."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-CO6", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user_a = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    user_b = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    user_a.module_restrictions = {"production": False}
    await session.flush()
    result_a = await resolve_access(session, user_a, "production")
    result_b = await resolve_access(session, user_b, "production")
    assert not result_a.granted, "Restricted user should be denied"
    assert result_b.granted, "Unrestricted user should be allowed"


# ── Test 5: System modules bypass company check ─────────────────────────────


async def test_dashboard_bypasses_company_check(session: AsyncSession):
    """System modules like dashboard should not require company module."""
    user = await _create_user(session, "MILL_OWNER")
    result = await resolve_access(session, user, "dashboard")
    assert result.granted, "Dashboard should bypass company module check"


# ── Test 6: UserModuleAccess — 3-state per-user override table ────────────────
# access_level values: "none" | "read" | "write"
# A row is FINAL — no fall-through to role defaults.


async def test_uma_none_denies_module(session: AsyncSession):
    """access_level='none' should deny even if role+company allow."""
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-UMA1", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    session.add(UserModuleAccess(user_id=user.id, module="production", access_level="none"))
    await session.flush()
    result = await resolve_access(session, user, "production")
    assert not result.granted, "UserModuleAccess 'none' should block"


async def test_uma_write_grants_full_access_beyond_role_default(session: AsyncSession):
    """
    TEST 2a: access_level='write' on a module the role has ZERO default access to.
    MACHINE_OPERATOR has no "purchase" — override sets it to write.
    Backend should grant write=True (NOT capped at read like the old boolean system).
    """
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-UMA2a", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "purchase", enabled=True)

    user = await _create_user(session, "MACHINE_OPERATOR", company_id=company.id)
    session.add(
        UserModuleAccess(user_id=user.id, module="purchase", access_level="write", set_by=user.id)
    )
    await session.flush()

    # Read access — GRANTED
    result_read = await resolve_access(session, user, "purchase", write=False)
    assert result_read.granted, (
        f"Should get purchase read. Got: granted={result_read.granted}"
    )

    # Write access — GRANTED (NEW: write override now gives write even for
    # roles with zero default access)
    result_write = await resolve_access(session, user, "purchase", write=True)
    assert result_write.granted, (
        f"MACHINE_OPERATOR with access_level='write' SHOULD get write access to purchase. "
        f"Got: granted={result_write.granted}, reason={result_write.reason}"
    )
    assert result_write.level == "write", (
        f"Should be write level. Got level={result_write.level}"
    )


async def test_uma_read_caps_write_from_role(session: AsyncSession):
    """
    TEST 2b: access_level='read' on a module the role normally has WRITE for.
    PRODUCTION_MANAGER normally has production=write.
    Override to 'read' should cap at read — write=False.
    """
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-UMA2b", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    session.add(UserModuleAccess(user_id=user.id, module="production", access_level="read"))
    await session.flush()

    # Read access — GRANTED
    result_read = await resolve_access(session, user, "production", write=False)
    assert result_read.granted, f"Read should be granted. Got: {result_read}"

    # Write access — DENIED (override caps at read)
    result_write = await resolve_access(session, user, "production", write=True)
    assert not result_write.granted, (
        f"Write should be denied with read override. Got: granted={result_write.granted}"
    )


async def test_uma_none_overrides_role_grant(session: AsyncSession):
    """
    TEST 2c: access_level='none' on a module the role normally has access to.
    PRODUCTION_MANAGER normally has production=write.
    Override to 'none' should deny read+write entirely.
    """
    company = Company(id=str(uuid.uuid4()), name="Test Co", code="T-UMA2c", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    session.add(UserModuleAccess(user_id=user.id, module="production", access_level="none"))
    await session.flush()

    result_read = await resolve_access(session, user, "production", write=False)
    assert not result_read.granted, (
        f"Read should be denied with 'none' override. Got: granted={result_read.granted}"
    )

    result_write = await resolve_access(session, user, "production", write=True)
    assert not result_write.granted, (
        f"Write should be denied with 'none' override. Got: granted={result_write.granted}"
    )


async def test_uma_deleted_restores_role_default(session: AsyncSession):
    """After deleting a UserModuleAccess row, the role default should apply again.

    This ensures that when an admin removes a per-user override, the user
    inherits from their role default — critical for allowing role-default
    changes to propagate.
    """
    company = Company(id=str(uuid.uuid4()).replace("-", ""), name="Test Co", code="T-UMA4", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)

    # First create an override that blocks production
    uma = UserModuleAccess(user_id=user.id, module="production", access_level="none")
    session.add(uma)
    await session.flush()

    result_denied = await resolve_access(session, user, "production")
    assert not result_denied.granted, "Should be denied with override in place"

    # Now delete the override
    await session.delete(uma)
    await session.flush()

    result_allowed = await resolve_access(session, user, "production")
    assert result_allowed.granted, "Should be allowed again after override removed"


async def test_uma_does_not_affect_other_users(session: AsyncSession):
    """UserModuleAccess on user A should not affect user B (tenant isolation)."""
    company = Company(id=str(uuid.uuid4()).replace("-", ""), name="Test Co", code="T-UMA5", is_active=True)
    session.add(company)
    await session.flush()
    await _ensure_company_module(session, company.id, "production", enabled=True)
    user_a = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    user_b = await _create_user(session, "PRODUCTION_MANAGER", company_id=company.id)
    session.add(UserModuleAccess(user_id=user_a.id, module="production", access_level="none"))
    await session.flush()
    result_a = await resolve_access(session, user_a, "production")
    result_b = await resolve_access(session, user_b, "production")
    assert not result_a.granted, "User A with deny override should be blocked"
    assert result_b.granted, "User B without override should still be allowed"

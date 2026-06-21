from __future__ import annotations
"""Canonical RBAC matrix — single source of truth for all access decisions.

Every permission check in backend and frontend derives from ACCESS_MATRIX below.
All three layers are enforced at the API level via access.py:
  1. Company subscription (company_modules)
  2. Role capability (this matrix)
  3. User module assignment (user_modules)
"""

from typing import Union, Literal
from app.core.module_registry import ALL_MODULE_CODES, SYSTEM_MODULE_CODES

ROLES = [
    "SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER",
    "PRODUCTION_MANAGER", "QUALITY_MANAGER", "DISPATCH_MANAGER",
    "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
    "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR",
    "SECURITY_GATE", "AUDITOR", "OPERATOR",
]

MODULES = ALL_MODULE_CODES

SYSTEM_MODULES = frozenset(SYSTEM_MODULE_CODES)

DASHBOARD_ONLY_ROLES = frozenset({"MACHINE_OPERATOR", "SECURITY_GATE"})

# Access level
#   True  = full read + write
#   "read" = read-only
#   absent = no access
AccessLevel = Union[Literal[True], Literal["read"]]

# ── CANONICAL ACCESS MATRIX ──────────────────────────────────────────────────
# Every change to role permissions happens HERE and nowhere else.
ACCESS_MATRIX: dict[str, dict[str, AccessLevel]] = {
    "SUPER_ADMIN": {m: True for m in MODULES},

    "MILL_OWNER": {m: True for m in MODULES},

    "GENERAL_MANAGER": {
        "dashboard": True,
        "production": "read",
        "quality": "read",
        "purchase": "read",
        "payroll": "read",
        "accounts": "read",
        "reports": True,
    },

    "PRODUCTION_MANAGER": {
        "dashboard": True, "production": True, "maintenance": "read",
        "quality": "read", "inventory": "read", "stock": "read",
        "reports": True, "uploads": True, "analytics": True,
        "alerts": "read",
    },

    "QUALITY_MANAGER": {
        "dashboard": True, "quality": True, "production": "read",
        "inventory": "read", "stock": "read",
        "reports": True, "uploads": True,
        "alerts": "read",
    },

    "DISPATCH_MANAGER": {
        "dashboard": True, "dispatch": True, "lotrac": True,
        "stores": True, "inventory": True, "sales": "read",
        "stock": "read", "reports": True, "uploads": True,
        "alerts": "read",
    },

    "STORE_MANAGER": {
        "dashboard": True, "stores": True, "inventory": True,
        "purchase": "read", "maintenance": "read",
        "reports": True, "stock": True, "uploads": True,
        "alerts": "read",
    },

    "HR_MANAGER": {
        "dashboard": True, "hr": True, "payroll": True,
        "reports": True, "uploads": True,
        "alerts": "read",
    },

    "ACCOUNTANT": {
        "dashboard": True, "accounts": True, "payroll": True,
        "purchase": "read", "dispatch": "read", "sales": "read",
        "reports": True, "lc_tracking": True, "uploads": True,
        "alerts": "read",
    },

    "MAINTENANCE_MANAGER": {
        "dashboard": True, "maintenance": True,
        "stores": "read", "production": "read",
        "reports": True, "uploads": True,
        "alerts": "read",
    },

    "SUPERVISOR": {
        "dashboard": True, "production": True, "reports": True,
        "alerts": "read",
    },

    "MACHINE_OPERATOR": {
        "dashboard": True,
        "production": True,   # can submit shift entries for their machine
        "alerts": "read",
    },

    "SECURITY_GATE": {
        "dashboard": True,
        "dispatch": "read",   # view trips at gate
        "lotrac": True,       # QR scan at gate
        "alerts": "read",
    },

    "AUDITOR": {
        "dashboard": True, "production": "read", "quality": "read",
        "hr": "read", "accounts": "read", "reports": True,
        "audit": True, "inventory": "read", "stores": "read",
        "dispatch": "read", "maintenance": "read",
        "alerts": "read",
    },

    # OPERATOR — general factory floor, lighter than SUPERVISOR
    "OPERATOR": {
        "dashboard": True,
        "production": True,
        "quality": "read",
        "stores": "read",
        "reports": "read",
        "alerts": "read",
    },
}

# ── DERIVED LOOKUPS ──────────────────────────────────────────────────────────

def role_modules(role: str) -> list[str]:
    """Modules a role can see at all (read or write)."""
    return list(ACCESS_MATRIX.get(role, {}).keys())

def role_write_modules(role: str) -> list[str]:
    """Modules a role has write (True) access to."""
    return [m for m, v in ACCESS_MATRIX.get(role, {}).items() if v is True]

def role_readonly_modules(role: str) -> list[str]:
    """Modules a role has read-only access to."""
    return [m for m, v in ACCESS_MATRIX.get(role, {}).items() if v == "read"]

def can_access(role: str, module: str) -> bool:
    """Role-level: does this role have ANY access (read or write) to this module?"""
    return ACCESS_MATRIX.get(role, {}).get(module) is not None

def can_write(role: str, module: str) -> bool:
    """Role-level: does this role have write access to this module?"""
    return ACCESS_MATRIX.get(role, {}).get(module) is True

def is_dashboard_only(role: str) -> bool:
    """True if this role should only see the dashboard."""
    return role in DASHBOARD_ONLY_ROLES

ROLE_MODULE_ACCESS: dict[str, list[str]] = {
    role: role_modules(role) for role in ROLES
}

ROLE_LABELS: dict[str, str] = {
    "SUPER_ADMIN": "Super Admin",
    "MILL_OWNER": "Mill Owner",
    "GENERAL_MANAGER": "General Manager",
    "PRODUCTION_MANAGER": "Production Manager",
    "QUALITY_MANAGER": "Quality Manager",
    "DISPATCH_MANAGER": "Dispatch Manager",
    "STORE_MANAGER": "Store Manager",
    "HR_MANAGER": "HR Manager",
    "ACCOUNTANT": "Accountant",
    "MAINTENANCE_MANAGER": "Maintenance Manager",
    "SUPERVISOR": "Supervisor",
    "MACHINE_OPERATOR": "Machine Operator",
    "SECURITY_GATE": "Security Gate",
    "AUDITOR": "Auditor (Read-only)",
    "OPERATOR": "Operator",
}

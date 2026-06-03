from typing import Union

ROLES = [
    "SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER",
    "PRODUCTION_MANAGER", "QUALITY_MANAGER", "DISPATCH_MANAGER",
    "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
    "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR",
    "SECURITY_GATE", "AUDITOR",
]

MODULES = [
    "dashboard", "production", "quality", "inventory", "dispatch",
    "purchase", "stores", "hr", "accounts", "maintenance",
    "users", "audit", "reports", "masters", "stock", "sales", "lotrac",
    "payroll",
    "column_config", "whatsapp", "lc_tracking", "analytics", "uploads",
]

# Canonical access matrix.
# True = read + write, "read" = read-only, absent = no access.
ACCESS_MATRIX: dict[str, dict[str, Union[bool, str]]] = {
    "SUPER_ADMIN": {m: True for m in MODULES},
    "MILL_OWNER": {m: True for m in MODULES},
    "GENERAL_MANAGER": {
        "dashboard": True, "production": True, "quality": True,
        "maintenance": True, "stores": True, "inventory": True,
        "dispatch": True, "purchase": True, "lotrac": True,
        "reports": True, "stock": True, "sales": True,
        "payroll": "read", "hr": "read", "accounts": "read", "audit": "read",
        "uploads": True, "analytics": True, "lc_tracking": True,
        "masters": "read",
    },
    "PRODUCTION_MANAGER": {
        "dashboard": True, "production": True, "quality": "read",
        "maintenance": "read", "inventory": "read", "stock": "read",
        "reports": True, "uploads": True, "analytics": True,
    },
    "QUALITY_MANAGER": {
        "dashboard": True, "quality": True, "production": "read",
        "inventory": "read", "stock": "read", "reports": True,
        "uploads": True,
    },
    "DISPATCH_MANAGER": {
        "dashboard": True, "dispatch": True, "lotrac": True,
        "stores": True, "inventory": True, "reports": True,
        "stock": "read", "sales": "read", "uploads": True,
    },
    "STORE_MANAGER": {
        "dashboard": True, "stores": True, "inventory": True,
        "purchase": "read", "maintenance": "read",
        "reports": True, "stock": True, "uploads": True,
    },
    "HR_MANAGER": {
        "dashboard": True, "hr": True, "payroll": True,
        "reports": True, "uploads": True,
    },
    "ACCOUNTANT": {
        "dashboard": True, "accounts": True, "payroll": True,
        "purchase": "read", "dispatch": "read", "sales": "read",
        "reports": True, "lc_tracking": True, "uploads": True,
    },
    "MAINTENANCE_MANAGER": {
        "dashboard": True, "maintenance": True,
        "stores": "read", "production": "read",
        "reports": True, "uploads": True,
    },
    "SUPERVISOR": {
        "dashboard": True, "production": True, "reports": True,
    },
    "MACHINE_OPERATOR": {
        "dashboard": True,
    },
    "SECURITY_GATE": {
        "dashboard": True,
    },
    "AUDITOR": {
        "dashboard": "read", "production": "read", "quality": "read",
        "hr": "read", "accounts": "read", "reports": "read",
    },
}

# Derive ROLE_MODULE_ACCESS from ACCESS_MATRIX (one source of truth).
ROLE_MODULE_ACCESS: dict[str, list[str]] = {
    role: list(modules.keys())
    for role, modules in ACCESS_MATRIX.items()
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
}


def can_access(role: str, module: str) -> bool:
    return ACCESS_MATRIX.get(role, {}).get(module) is not None


def can_write(role: str, module: str) -> bool:
    return ACCESS_MATRIX.get(role, {}).get(module) is True

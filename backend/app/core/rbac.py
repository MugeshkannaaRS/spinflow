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
]

from typing import Union

ACCESS_MATRIX: dict[str, dict[str, Union[bool, str]]] = {
    "SUPER_ADMIN": {m: True for m in MODULES},
    "MILL_OWNER": {"dashboard": True, "reports": True, "stock": True, "sales": True, **{m: "read" for m in MODULES if m not in ("dashboard", "reports", "stock", "sales")}},
    "GENERAL_MANAGER": {"dashboard": True, "production": True, "quality": True, "inventory": True, "dispatch": True, "purchase": True, "stores": True, "hr": "read", "accounts": "read", "maintenance": True, "reports": True, "audit": "read", "stock": True, "sales": True},
    "PRODUCTION_MANAGER": {"dashboard": True, "production": True, "quality": "read", "inventory": "read", "reports": True, "stock": "read"},
    "QUALITY_MANAGER": {"dashboard": True, "quality": True, "production": "read", "inventory": "read", "reports": True, "stock": "read"},
    "DISPATCH_MANAGER": {"dashboard": True, "dispatch": True, "inventory": "read", "reports": True, "stock": "read", "sales": "read"},
    "STORE_MANAGER": {"dashboard": True, "stores": True, "inventory": True, "purchase": "read", "reports": True, "stock": True},
    "HR_MANAGER": {"dashboard": True, "hr": True, "reports": True},
    "ACCOUNTANT": {"dashboard": True, "accounts": True, "purchase": "read", "dispatch": "read", "reports": True, "sales": "read"},
    "MAINTENANCE_MANAGER": {"dashboard": True, "maintenance": True, "stores": "read", "production": "read", "reports": True},
    "SUPERVISOR": {"dashboard": True, "production": True},
    "MACHINE_OPERATOR": {"dashboard": True, "production": True},
    "SECURITY_GATE": {"dashboard": True, "dispatch": "read"},
    "AUDITOR": {m: "read" for m in MODULES},
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

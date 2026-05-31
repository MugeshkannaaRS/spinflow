SUPER_ADMIN = "SUPER_ADMIN"

ROLE_MODULE_ACCESS = {
    "SUPER_ADMIN": ["admin", "column_config"],
    "MILL_OWNER": ["dashboard", "production", "quality", "maintenance", "hr", "payroll",
                   "purchase", "stores", "inventory", "dispatch", "lotrac", "accounts",
                   "sales", "masters", "users", "column_config"],
    "GENERAL_MANAGER": ["dashboard", "production", "quality", "maintenance", "hr",
                        "payroll", "purchase", "stores", "inventory", "dispatch",
                        "accounts", "sales", "masters"],
    "PRODUCTION_MANAGER": ["dashboard", "production", "quality", "maintenance"],
    "QUALITY_MANAGER": ["dashboard", "quality", "production"],
    "DISPATCH_MANAGER": ["dashboard", "dispatch", "lotrac", "stores", "inventory"],
    "STORE_MANAGER": ["dashboard", "stores", "inventory", "purchase"],
    "HR_MANAGER": ["dashboard", "hr", "payroll"],
    "ACCOUNTANT": ["dashboard", "accounts", "sales", "payroll"],
    "MAINTENANCE_MANAGER": ["dashboard", "maintenance", "stores"],
    "SUPERVISOR": ["dashboard", "production"],
    "MACHINE_OPERATOR": ["dashboard"],
    "SECURITY_GATE": ["dashboard"],
    "AUDITOR": ["dashboard", "production", "quality", "hr", "accounts"],
}

def get_role_modules(role_code: str) -> list[str]:
    return ROLE_MODULE_ACCESS.get(role_code, ["dashboard"])

def is_super_admin(role_code: str) -> bool:
    return role_code == SUPER_ADMIN

def can_access_module(role_code: str, module: str) -> bool:
    return module in get_role_modules(role_code)

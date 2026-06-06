"""Canonical module registry — single source of truth for module definitions.

All frontend module lists, billing module lists, and masters module lists
MUST derive from this registry. No hardcoded module lists elsewhere.
"""

from typing import Dict, List


class ModuleDef:
    """Definition of a single module."""

    def __init__(self, code: str, label: str, description: str, category: str = "core"):
        self.code = code
        self.label = label
        self.description = description
        self.category = category  # "core", "addon", "system"


# ── Canonical Module Definitions ─────────────────────────────────

ALL_MODULES_DEFS: Dict[str, ModuleDef] = {
    mod.code: mod
    for mod in [
        ModuleDef("dashboard", "Dashboard", "Overview KPIs, charts, and alerts", "system"),
        ModuleDef("production", "Production", "Machine entries, shift logging, downtime tracking", "core"),
        ModuleDef("quality", "Quality Control", "Tests, lot approvals, CSP tracking", "core"),
        ModuleDef("inventory", "Inventory", "Lot management, transfers, warehouse operations", "core"),
        ModuleDef("dispatch", "Dispatch", "Sales orders, trips, loading, delivery", "core"),
        ModuleDef("purchase", "Cotton Purchase", "Cotton purchase, bales, suppliers, GRN", "core"),
        ModuleDef("stores", "Stores & Spares", "Spare parts inventory, issues, stock receive", "core"),
        ModuleDef("hr", "Human Resources", "Employees, attendance, leaves", "core"),
        ModuleDef("accounts", "Accounts", "Invoices, receivables, GST, P&L", "core"),
        ModuleDef("maintenance", "Maintenance", "Machine maintenance, schedules, logs", "core"),
        ModuleDef("payroll", "Payroll", "Monthly payroll, payslips, processing", "addon"),
        ModuleDef("sales", "Sales", "Sales orders, customer management", "addon"),
        ModuleDef("lotrac", "LoTrac", "GPS trip tracking, QR scanning, delivery confirmation", "addon"),
        ModuleDef("reports", "Reports", "Custom reports and exports", "addon"),
        ModuleDef("stock", "Stock", "Stock snapshot, lot balance, warehouse stock", "addon"),
        ModuleDef("audit", "Audit Log", "System audit trail and logging", "system"),
        ModuleDef("users", "Users & Roles", "User management and role assignment", "system"),
        ModuleDef("masters", "Masters", "Master data: customers, suppliers, yarn counts", "system"),
        ModuleDef("column_config", "Column Config", "Customize table column visibility", "system"),
        ModuleDef("uploads", "Uploads", "File uploads and attachments", "addon"),
    ]
}

# Derived lists
ALL_MODULE_CODES: List[str] = sorted(ALL_MODULES_DEFS.keys())
CORE_MODULE_CODES: List[str] = sorted(c for c, m in ALL_MODULES_DEFS.items() if m.category == "core")
ADDON_MODULE_CODES: List[str] = sorted(c for c, m in ALL_MODULES_DEFS.items() if m.category == "addon")
SYSTEM_MODULE_CODES: List[str] = sorted(c for c, m in ALL_MODULES_DEFS.items() if m.category == "system")


def get_module_label(code: str) -> str:
    return ALL_MODULES_DEFS[code].label if code in ALL_MODULES_DEFS else code


def get_module_description(code: str) -> str:
    return ALL_MODULES_DEFS[code].description if code in ALL_MODULES_DEFS else ""

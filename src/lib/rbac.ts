// Role-Based Access Control matrix for SpinFlow ERP
export const ROLES = [
  "SUPER_ADMIN",
  "MILL_OWNER",
  "GENERAL_MANAGER",
  "PRODUCTION_MANAGER",
  "QUALITY_MANAGER",
  "DISPATCH_MANAGER",
  "STORE_MANAGER",
  "HR_MANAGER",
  "ACCOUNTANT",
  "MAINTENANCE_MANAGER",
  "SUPERVISOR",
  "MACHINE_OPERATOR",
  "SECURITY_GATE",
  "AUDITOR",
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  MILL_OWNER: "Mill Owner",
  GENERAL_MANAGER: "General Manager",
  PRODUCTION_MANAGER: "Production Manager",
  QUALITY_MANAGER: "Quality Manager",
  DISPATCH_MANAGER: "Dispatch Manager",
  STORE_MANAGER: "Store Manager",
  HR_MANAGER: "HR Manager",
  ACCOUNTANT: "Accountant",
  MAINTENANCE_MANAGER: "Maintenance Manager",
  SUPERVISOR: "Supervisor",
  MACHINE_OPERATOR: "Machine Operator",
  SECURITY_GATE: "Security Gate",
  AUDITOR: "Auditor (Read-only)",
};

export type Module =
  | "dashboard"
  | "production"
  | "quality"
  | "inventory"
  | "dispatch"
  | "purchase"
  | "stores"
  | "hr"
  | "accounts"
  | "maintenance"
  | "users"
  | "audit"
  | "reports"
  | "masters"
  | "stock"
  | "sales"
  | "lotrac"
  | "payroll";

// Module access matrix. true = read+write, "read" = read-only.
export const ACCESS: Record<Role, Partial<Record<Module, true | "read">>> = {
  SUPER_ADMIN: {
    dashboard: true,
    production: true,
    quality: true,
    inventory: true,
    dispatch: true,
    purchase: true,
    stores: true,
    hr: true,
    accounts: true,
    maintenance: true,
    users: true,
    audit: true,
    reports: true,
    masters: true,
    stock: true,
    sales: true,
  },
  MILL_OWNER: {
    dashboard: true,
    production: "read",
    quality: "read",
    inventory: "read",
    dispatch: "read",
    purchase: "read",
    stores: "read",
    hr: "read",
    accounts: "read",
    maintenance: "read",
    audit: "read",
    reports: true,
    masters: "read",
    stock: true,
    sales: true,
  },
  GENERAL_MANAGER: {
    dashboard: true,
    production: true,
    quality: true,
    inventory: true,
    dispatch: true,
    purchase: true,
    stores: true,
    hr: "read",
    accounts: "read",
    maintenance: true,
    reports: true,
    audit: "read",
    stock: true,
    sales: true,
  },
  PRODUCTION_MANAGER: {
    dashboard: true,
    production: true,
    quality: "read",
    inventory: "read",
    reports: true,
  },
  QUALITY_MANAGER: {
    dashboard: true,
    quality: true,
    production: "read",
    inventory: "read",
    reports: true,
  },
  DISPATCH_MANAGER: { dashboard: true, dispatch: true, inventory: "read", reports: true, stock: "read", sales: "read" },
  STORE_MANAGER: {
    dashboard: true,
    stores: true,
    inventory: true,
    purchase: "read",
    reports: true,
    stock: true,
  },
  HR_MANAGER: { dashboard: true, hr: true, reports: true },
  ACCOUNTANT: {
    dashboard: true,
    accounts: true,
    purchase: "read",
    dispatch: "read",
    reports: true,
    sales: "read",
  },
  MAINTENANCE_MANAGER: {
    dashboard: true,
    maintenance: true,
    stores: "read",
    production: "read",
    reports: true,
  },
  SUPERVISOR: { dashboard: true, production: true },
  MACHINE_OPERATOR: { dashboard: true, production: true },
  SECURITY_GATE: { dashboard: true, dispatch: "read" },
  AUDITOR: {
    dashboard: "read",
    production: "read",
    quality: "read",
    inventory: "read",
    dispatch: "read",
    purchase: "read",
    stores: "read",
    hr: "read",
    accounts: "read",
    maintenance: "read",
    audit: "read",
    reports: "read",
    stock: "read",
    sales: "read",
  },
};

export function canAccess(role: Role, module: Module): boolean {
  return ACCESS[role]?.[module] !== undefined;
}

export function canWrite(role: Role, module: Module): boolean {
  return ACCESS[role]?.[module] === true;
}

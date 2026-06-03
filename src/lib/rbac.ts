import { buildAccessContext, finalAccess, type AccessContext } from "./access";

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
  "OPERATOR",
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
  OPERATOR: "Operator",
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

// Synchronous permission checks for places that cannot use hooks.
// These check Layer 2 (role capability) only — no company subscription or user restrictions.
const _ctxCache = new Map<string, AccessContext>();

function _getCtx(role: Role): AccessContext {
  let ctx = _ctxCache.get(role);
  if (!ctx) {
    ctx = buildAccessContext(role, null, null);
    _ctxCache.set(role, ctx);
  }
  return ctx;
}

export function canAccess(role: Role, module: Module): boolean {
  return finalAccess(_getCtx(role), module, false).granted;
}

export function canWrite(role: Role, module: Module): boolean {
  const result = finalAccess(_getCtx(role), module, true);
  return result.granted;
}

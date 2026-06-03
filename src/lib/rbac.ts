import { useAuth } from "@/stores/auth";
import { useRBAC } from "@/hooks/useRBAC";

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

// Delegate to useRBAC hook for live permission checks.
// These import-less functions exist for places that cannot use hooks directly.
// They derive state from zustand synchronously.
export function canAccess(role: Role, module: Module): boolean {
  if (role === "SUPER_ADMIN") return true;
  const moduleList: Record<string, string[]> = {
    "SUPER_ADMIN": ["dashboard","admin","column_config"],
    "MILL_OWNER": ["dashboard","production","quality","maintenance","hr","payroll","purchase","stores","inventory","dispatch","lotrac","accounts","sales","masters","users","reports","column_config","stock","whatsapp","lc_tracking","analytics","uploads","audit"],
    "GENERAL_MANAGER": ["dashboard","production","quality","maintenance","stores","inventory","dispatch","purchase","lotrac","reports","stock","sales","analytics","lc_tracking","uploads","payroll","hr","accounts","audit","masters"],
    "PRODUCTION_MANAGER": ["dashboard","production","quality","maintenance","reports","analytics","uploads","inventory","stock"],
    "QUALITY_MANAGER": ["dashboard","quality","production","reports","uploads","inventory","stock"],
    "DISPATCH_MANAGER": ["dashboard","dispatch","lotrac","stores","inventory","reports","uploads","stock","sales"],
    "STORE_MANAGER": ["dashboard","stores","inventory","purchase","maintenance","reports","stock","uploads"],
    "HR_MANAGER": ["dashboard","hr","payroll","reports","uploads"],
    "ACCOUNTANT": ["dashboard","accounts","payroll","purchase","dispatch","sales","reports","lc_tracking","uploads"],
    "MAINTENANCE_MANAGER": ["dashboard","maintenance","stores","reports","uploads"],
    "SUPERVISOR": ["dashboard","production","reports"],
    "MACHINE_OPERATOR": ["dashboard"],
    "SECURITY_GATE": ["dashboard"],
    "AUDITOR": ["dashboard","production","quality","hr","accounts","reports"],
  };
  const modules = moduleList[role] ?? ["dashboard"];
  return modules.includes(module);
}

export function canWrite(role: Role, module: Module): boolean {
  if (role === "SUPER_ADMIN") return true;
  // Use a lightweight inline matrix for write permissions only
  // (derived from backend's canonical ACCESS_MATRIX).
  const writeModules: Record<string, string[]> = {
    "SUPER_ADMIN": ["dashboard","production","quality","maintenance","hr","payroll","purchase","stores","inventory","dispatch","lotrac","accounts","sales","masters","users","reports","column_config","stock","whatsapp","lc_tracking","analytics","uploads","audit"],
    "MILL_OWNER": ["dashboard","production","quality","maintenance","hr","payroll","purchase","stores","inventory","dispatch","lotrac","accounts","sales","masters","users","reports","column_config","stock","whatsapp","lc_tracking","analytics","uploads","audit"],
    "GENERAL_MANAGER": ["dashboard","production","quality","maintenance","stores","inventory","dispatch","purchase","lotrac","reports","stock","sales","uploads","analytics","lc_tracking"],
    "PRODUCTION_MANAGER": ["dashboard","production","reports","uploads","analytics"],
    "QUALITY_MANAGER": ["dashboard","quality","reports","uploads"],
    "DISPATCH_MANAGER": ["dashboard","dispatch","lotrac","stores","inventory","reports","uploads"],
    "STORE_MANAGER": ["dashboard","stores","inventory","reports","stock","uploads"],
    "HR_MANAGER": ["dashboard","hr","payroll","reports","uploads"],
    "ACCOUNTANT": ["dashboard","accounts","payroll","reports","lc_tracking","uploads"],
    "MAINTENANCE_MANAGER": ["dashboard","maintenance","reports","uploads"],
    "SUPERVISOR": ["dashboard","production","reports"],
    "MACHINE_OPERATOR": ["dashboard"],
    "SECURITY_GATE": ["dashboard"],
    "AUDITOR": [],
  };
  const writes = writeModules[role] ?? ["dashboard"];
  return writes.includes(module);
}

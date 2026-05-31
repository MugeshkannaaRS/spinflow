import { useAuth } from "@/stores/auth";

const ROLE_MODULES: Record<string, string[]> = {
  SUPER_ADMIN: ["admin", "column_config"],
  MILL_OWNER: ["dashboard", "production", "quality", "maintenance", "hr", "payroll",
               "purchase", "stores", "inventory", "dispatch", "lotrac", "accounts",
               "sales", "masters", "users", "column_config"],
  GENERAL_MANAGER: ["dashboard", "production", "quality", "maintenance", "hr",
                    "payroll", "purchase", "stores", "inventory", "dispatch",
                    "accounts", "sales", "masters"],
  PRODUCTION_MANAGER: ["dashboard", "production", "quality", "maintenance"],
  QUALITY_MANAGER: ["dashboard", "quality", "production"],
  DISPATCH_MANAGER: ["dashboard", "dispatch", "lotrac", "stores", "inventory"],
  STORE_MANAGER: ["dashboard", "stores", "inventory", "purchase"],
  HR_MANAGER: ["dashboard", "hr", "payroll"],
  ACCOUNTANT: ["dashboard", "accounts", "sales", "payroll"],
  MAINTENANCE_MANAGER: ["dashboard", "maintenance", "stores"],
  SUPERVISOR: ["dashboard", "production"],
  MACHINE_OPERATOR: ["dashboard"],
  SECURITY_GATE: ["dashboard"],
  AUDITOR: ["dashboard", "production", "quality", "hr", "accounts"],
};

export function useRBAC() {
  const user = useAuth(s => s.user);
  const role = user?.role ?? "MACHINE_OPERATOR";
  const isSuperAdmin = role === "SUPER_ADMIN";
  const allowedModules = ROLE_MODULES[role] ?? ["dashboard"];

  function canAccess(module: string): boolean {
    return allowedModules.includes(module);
  }

  return { role, isSuperAdmin, canAccess, allowedModules };
}

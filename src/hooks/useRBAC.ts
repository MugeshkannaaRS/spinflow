import { useAuth } from "@/stores/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ROLE_MODULES: Record<string, string[]> = {
  SUPER_ADMIN: ["dashboard", "admin", "column_config"],
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

  const { data: companyModules } = useQuery({
    queryKey: ["company-modules", user?.companyId],
    queryFn: () => api.get(`/admin/companies/${user?.companyId}/modules`).then(r => r.data),
    enabled: !!user?.companyId && !isSuperAdmin,
    staleTime: 10 * 60 * 1000,
  });

  const allowedModules = ROLE_MODULES[role] ?? ["dashboard"];

  function canAccess(module: string): boolean {
    if (isSuperAdmin) return ["dashboard", "admin", "column_config"].includes(module);
    const roleAllows = allowedModules.includes(module);
    const companyAllows = !companyModules || companyModules[module] === true;
    return roleAllows && companyAllows;
  }

  return { role, isSuperAdmin, canAccess, allowedModules };
}

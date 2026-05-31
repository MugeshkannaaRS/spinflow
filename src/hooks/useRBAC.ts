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

const KEY_MAP: Record<string, string> = {
  "column_config": "column_config",
  "column-config": "column_config",
};

function normaliseKey(key: string): string {
  return KEY_MAP[key] ?? key.replace(/-/g, "_");
}

export function useRBAC() {
  const user = useAuth(s => s.user);
  const role = user?.role ?? "MACHINE_OPERATOR";
  const isSuperAdmin = role === "SUPER_ADMIN";

  const { data: companyModules, isFetched } = useQuery({
    queryKey: ["company-modules", user?.companyId],
    queryFn: () => api.get(`/admin/companies/${user?.companyId}/modules`).then(r => r.data as Record<string, boolean>),
    enabled: !!user?.companyId && !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const allowedModules = ROLE_MODULES[role] ?? ["dashboard"];
  const companyModulesLoaded = isFetched || isSuperAdmin || !user?.companyId;

  function canAccess(module: string): boolean {
    if (isSuperAdmin) {
      return ["dashboard", "admin", "column_config"].includes(normaliseKey(module));
    }
    const roleAllows = allowedModules.includes(module);
    if (!roleAllows) return false;

    if (companyModules !== null && companyModules !== undefined) {
      const key = normaliseKey(module);
      if (["dashboard", "users", "masters"].includes(key)) return true;
      return companyModules[key] === true;
    }

    return roleAllows;
  }

  return { role, isSuperAdmin, canAccess, allowedModules, companyModulesLoaded };
}

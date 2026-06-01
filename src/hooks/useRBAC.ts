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

const DB_MODULE_KEY_MAP: Record<string, string> = {
  "dashboard": "dashboard",
  "production": "production",
  "quality": "quality",
  "maintenance": "maintenance",
  "hr": "hr",
  "payroll": "payroll",
  "purchase": "purchase",
  "cotton-purchase": "purchase",
  "stores": "stores",
  "inventory": "inventory",
  "dispatch": "dispatch",
  "lotrac": "lotrac",
  "accounts": "accounts",
  "sales": "sales",
  "reports": "reports",
  "masters": "masters",
  "users": "users",
  "audit": "audit",
  "stock": "stock",
  "column_config": "column_config",
  "column-config": "column_config",
  "admin": "admin",
};

function normaliseKey(key: string): string {
  return DB_MODULE_KEY_MAP[key] ?? key.replace(/-/g, "_");
}

export function useRBAC() {
  const user = useAuth(s => s.user);
  const role = user?.role ?? "MACHINE_OPERATOR";
  const isSuperAdmin = role === "SUPER_ADMIN";

  const { data: companyModules, isSuccess: modulesLoaded } = useQuery({
    queryKey: ["company-modules", user?.companyId],
    queryFn: async () => {
      if (!user?.companyId || isSuperAdmin) return null;
      try {
        const res = await api.get(`/admin/companies/${user.companyId}/modules`);
        console.log("Company modules loaded:", res.data);
        return res.data as Record<string, boolean>;
      } catch (err: any) {
        if (err?.response?.status === 403) {
          console.warn("Cannot fetch company modules — using role-based access only");
          return null;
        }
        return null;
      }
    },
    enabled: !!user?.companyId && !isSuperAdmin,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const allowedModules = ROLE_MODULES[role] ?? ["dashboard"];
  const companyModulesLoaded = isSuperAdmin ? true : modulesLoaded;

  function canAccess(module: string): boolean {
    if (isSuperAdmin) {
      return ["dashboard", "admin", "column_config"].includes(normaliseKey(module));
    }

    const roleAllows = allowedModules.includes(module);
    if (!roleAllows) return false;

    const dbKey = normaliseKey(module);

    // System features — always allow if role permits, never check company_modules
    const SYSTEM_FEATURES = ["dashboard", "masters", "users", "column_config", "admin", "audit"];
    if (SYSTEM_FEATURES.includes(dbKey)) return true;

    if (modulesLoaded && companyModules !== null && companyModules !== undefined) {
      const enabled = companyModules[dbKey];
      console.log(`Module check: ${module} (${dbKey}) = ${enabled}`);
      return enabled === true;
    }

    return roleAllows;
  }

  return { role, isSuperAdmin, canAccess, allowedModules, companyModulesLoaded };
}

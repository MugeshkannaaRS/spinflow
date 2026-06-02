import { useAuth } from "@/stores/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const ROLE_MODULES: Record<string, string[]> = {
  SUPER_ADMIN: ["dashboard", "admin", "column_config"],
  MILL_OWNER: [
    "dashboard","production","quality","maintenance","hr","payroll",
    "purchase","stores","inventory","dispatch","lotrac","accounts",
    "sales","masters","users","reports","column_config",
    "whatsapp","lc_tracking","analytics"
  ],
  GENERAL_MANAGER: [
    "dashboard","production","quality","maintenance","hr","payroll",
    "purchase","stores","inventory","dispatch","accounts","sales",
    "masters","reports","lotrac","lc_tracking","analytics"
  ],
  PRODUCTION_MANAGER: ["dashboard","production","quality","maintenance","reports"],
  QUALITY_MANAGER: ["dashboard","quality","production","reports"],
  DISPATCH_MANAGER: ["dashboard","dispatch","lotrac","stores","inventory","reports"],
  STORE_MANAGER: ["dashboard","stores","inventory","purchase","maintenance","reports"],
  HR_MANAGER: ["dashboard","hr","payroll","reports"],
  ACCOUNTANT: ["dashboard","accounts","sales","payroll","purchase","reports","lc_tracking"],
  MAINTENANCE_MANAGER: ["dashboard","maintenance","stores","reports"],
  SUPERVISOR: ["dashboard","production","reports"],
  MACHINE_OPERATOR: ["dashboard"],
  SECURITY_GATE: ["dashboard"],
  AUDITOR: ["dashboard","production","quality","hr","accounts","reports"],
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
      if (isSuperAdmin) return null;
      if (!user?.companyId) return null;
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
    enabled: !isSuperAdmin,
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const allowedModules = ROLE_MODULES[role] ?? ["dashboard"];
  const companyModulesLoaded = isSuperAdmin ? true : modulesLoaded;

  // System modules: always accessible if role permits, skip company_modules check
  const SYSTEM_MODULES = ["dashboard","masters","users","column_config","admin","audit"];

  function canAccess(module: string): boolean {
    if (isSuperAdmin) {
      return ["dashboard","admin","column_config"].includes(module);
    }

    const dbKey = DB_MODULE_KEY_MAP[module] ?? module.replace(/-/g,"_");
    const roleAllowed = (ROLE_MODULES[role] ?? ["dashboard"]).includes(module);
    if (!roleAllowed) return false;

    // System modules: always allow if role permits
    if (SYSTEM_MODULES.includes(dbKey)) return true;

    // Company module check
    if (modulesLoaded && companyModules !== null && companyModules !== undefined) {
      return companyModules[dbKey] === true;
    }

    return false;
  }

  return { role, isSuperAdmin, canAccess, allowedModules, companyModulesLoaded };
}

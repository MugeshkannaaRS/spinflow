import { useAuth } from "@/stores/auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  finalAccess,
  buildAccessContext,
  DASHBOARD_ONLY_ROLES,
  type AccessResult,
  type AccessContext,
} from "@/lib/access";

export { DASHBOARD_ONLY_ROLES };
export type { AccessResult, AccessContext };

// Route-to-module mapping replaces the one previously in useModuleAccess.ts
const ROUTE_TO_MODULE: Record<string, string> = {
  "/production": "production",
  "/quality": "quality",
  "/maintenance": "maintenance",
  "/hr": "hr",
  "/payroll": "payroll",
  "/purchase": "purchase",
  "/stores": "stores",
  "/inventory": "inventory",
  "/dispatch": "dispatch",
  "/lotrac": "lotrac",
  "/accounts": "accounts",
  "/sales": "sales",
  "/stock": "stock",
  "/reports": "reports",
  "/masters": "masters",
  "/users": "users",
  "/audit": "audit",
};

export function useRBAC() {
  const user = useAuth((s) => s.user);
  const role = user?.role ?? "MACHINE_OPERATOR";
  const isSuperAdmin = role === "SUPER_ADMIN";

  const { data: companyModules, isSuccess: modulesLoaded } = useQuery({
    queryKey: ["company-modules", user?.companyId],
    queryFn: async () => {
      if (isSuperAdmin) return null;
      if (!user?.companyId) return null;
      try {
        const res = await api.get(`/admin/companies/${user.companyId}/modules`);
        return res.data as Record<string, boolean>;
      } catch (err: any) {
        if (err?.response?.status === 403) {
          return null;
        }
        return null;
      }
    },
    enabled: !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const moduleRestrictions = (user?.moduleRestrictions ?? null) as Record<string, string> | null;
  const modules = (companyModules ?? null) as Record<string, boolean> | null;

  const ctx = buildAccessContext(role, modules, moduleRestrictions);
  const companyModulesLoaded = isSuperAdmin ? true : modulesLoaded;

  function canAccess(module: string, write: boolean = false): boolean {
    return finalAccess(ctx, module, write).granted;
  }

  function getAccessLevel(module: string): AccessResult {
    return finalAccess(ctx, module, false);
  }

  function isDashboardOnly(): boolean {
    return DASHBOARD_ONLY_ROLES.has(role);
  }

  function canAccessRoute(path: string): boolean {
    const entry = Object.entries(ROUTE_TO_MODULE).find(
      ([route]) => path === route || path.startsWith(route + "/"),
    );
    if (!entry) return true;
    return canAccess(entry[1], false);
  }

  return {
    role,
    isSuperAdmin,
    canAccess,
    canAccessRoute,
    getAccessLevel,
    isDashboardOnly,
    ctx,
    companyModulesLoaded,
    moduleRestrictions,
  };
}

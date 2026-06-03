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
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const moduleRestrictions = (user?.moduleRestrictions ?? null) as Record<string, boolean> | null;
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

  return {
    role,
    isSuperAdmin,
    canAccess,
    getAccessLevel,
    isDashboardOnly,
    ctx,
    companyModulesLoaded,
    moduleRestrictions,
  };
}

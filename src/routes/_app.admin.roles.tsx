import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, mastersApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Shield, Search, Copy, CheckSquare, RefreshCw, History,
  Building2, Loader2, AlertTriangle, CheckCircle2, X,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/roles")({
  head: () => ({ meta: [{ title: "Role-Module Matrix — Admin — SpinFlow ERP" }] }),
  component: RoleMatrixPage,
});

const ALL_MODULES = [
  "dashboard", "production", "quality", "maintenance", "alerts",
  "hr", "payroll", "purchase", "stores", "inventory", "dispatch",
  "lotrac", "accounts", "sales", "masters", "users", "audit",
  "billing", "reports",
];

const PERMISSIONS = ["view", "create", "edit", "delete", "export", "import", "approve"];

const ROLES = [
  "SUPER_ADMIN", "MILL_OWNER", "GENERAL_MANAGER", "PRODUCTION_MANAGER",
  "QUALITY_MANAGER", "DISPATCH_MANAGER", "STORE_MANAGER", "HR_MANAGER",
  "ACCOUNTANT", "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR",
  "SECURITY_GATE", "AUDITOR", "OPERATOR",
];

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin", MILL_OWNER: "Mill Owner", GENERAL_MANAGER: "General Manager",
  PRODUCTION_MANAGER: "Production Manager", QUALITY_MANAGER: "Quality Manager",
  DISPATCH_MANAGER: "Dispatch Manager", STORE_MANAGER: "Store Manager",
  HR_MANAGER: "HR Manager", ACCOUNTANT: "Accountant",
  MAINTENANCE_MANAGER: "Maintenance Manager", SUPERVISOR: "Supervisor",
  MACHINE_OPERATOR: "Machine Operator", SECURITY_GATE: "Security Gate",
  AUDITOR: "Auditor", OPERATOR: "Operator",
};

function RoleMatrixPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [moduleSearch, setModuleSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [matrix, setMatrix] = useState<Record<string, Record<string, string[]>>>({});

  const companiesQ = useQuery({
    queryKey: ["masters-companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
  });

  const companies: any[] = Array.isArray(companiesQ.data) ? companiesQ.data : [];

  const roleConfigQ = useQuery({
    queryKey: ["role-config", companyId],
    queryFn: () => adminApi.getRoleConfig(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const roleModulesQ = useQuery({
    queryKey: ["role-modules", companyId],
    queryFn: () => adminApi.getRoleModules(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => adminApi.updateRoleModules(companyId, data),
    onSuccess: () => {
      toast.success("Role-module matrix updated");
      qc.invalidateQueries({ queryKey: ["role-modules", companyId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to update"),
  });

  const copyFromMutation = useMutation({
    mutationFn: ({ fromRole, data }: { fromRole: string; data: any }) =>
      adminApi.updateRoleModules(companyId, data),
    onSuccess: () => {
      toast.success("Permissions copied");
      qc.invalidateQueries({ queryKey: ["role-modules", companyId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to copy"),
  });

  const selectedCompany = companies.find((c: any) => c.id === companyId);

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const roleConfig: any[] = Array.isArray(roleConfigQ.data) ? roleConfigQ.data : [];
  const enabledRoles = roleConfig.filter((r: any) => r.is_enabled !== false).map((r: any) => r.role_code);
  const allRoleModules: any[] = Array.isArray(roleModulesQ.data) ? roleModulesQ.data : [];

  const getRolePermissions = (role: string, module: string): string[] => {
    const rm = allRoleModules.find((r: any) => r.role_code === role);
    if (rm?.permissions?.[module]) return rm.permissions[module];
    if (rm?.modules?.[module]) return ["view"];
    return [];
  };

  const togglePermission = (role: string, module: string, perm: string) => {
    setMatrix((prev) => {
      const current = getRolePermissions(role, module);
      const has = current.includes(perm);
      const updated = has ? current.filter((p) => p !== perm) : [...current, perm];
      if (!updated.length && !prev[role]?.[module]) return prev;
      return {
        ...prev,
        [role]: { ...prev[role], [module]: updated },
      };
    });
  };

  const setAllPermissions = (role: string, module: string, value: boolean) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [module]: value ? [...PERMISSIONS] : [] },
    }));
  };

  const hasChanges = Object.keys(matrix).length > 0;

  const filteredRoles = useMemo(() => {
    if (!search) return ROLES;
    const q = search.toLowerCase();
    return ROLES.filter((r) => ROLE_LABELS[r].toLowerCase().includes(q));
  }, [search]);

  const filteredModules = useMemo(() => {
    if (!moduleSearch) return ALL_MODULES;
    const q = moduleSearch.toLowerCase();
    return ALL_MODULES.filter((m) => m.includes(q));
  }, [moduleSearch]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Role-Module Matrix</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage role-based module permissions across companies</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="size-3.5 mr-1.5" /> Audit History
          </Button>
          {hasChanges && (
            <Button size="sm" onClick={() => {
              saveMutation.mutate({ overrides: matrix });
            }} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <CheckSquare className="size-3.5 mr-1.5" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      {/* Company selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">Company</span>
            </div>
            <select
              value={companyId}
              onChange={(e) => { setCompanyId(e.target.value); setMatrix({}); }}
              className="flex-1 max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="">Select a company...</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
              ))}
            </select>
            {selectedCompany && (
              <Badge variant="outline" className="text-xs">{selectedCompany.subscription_plan ?? "No plan"}</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {!companyId ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium">Select a company</p>
          <p className="text-sm text-muted-foreground mt-1">Choose a company above to view and edit its role-module permission matrix.</p>
        </div>
      ) : companiesQ.isLoading || roleModulesQ.isLoading ? (
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <>
          {/* Search and Bulk Actions */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex gap-3 items-center">
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search roles..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm w-48"
                />
              </div>
              <div className="relative">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search modules..." value={moduleSearch} onChange={(e) => setModuleSearch(e.target.value)}
                  className="pl-8 h-9 text-sm w-48"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => {
                if (!selectedCompany) return;
                const first = ROLES[0];
                const perms: Record<string, Record<string, string[]>> = {};
                for (const role of ROLES.slice(1)) {
                  perms[role] = {};
                  for (const mod of ALL_MODULES) {
                    const p = getRolePermissions(first, mod);
                    if (p.length) perms[role][mod] = p;
                  }
                }
                copyFromMutation.mutate({ fromRole: first, data: { overrides: perms } });
              }}>
                <Copy className="size-3.5 mr-1.5" /> Copy from {ROLE_LABELS[ROLES[0]]?.split(" ")[0]}
              </Button>
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-3 py-2.5 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[140px]">Role / Module</th>
                  {filteredModules.map((mod) => (
                    <th key={mod} className="px-2 py-2.5 font-semibold text-gray-700 text-center capitalize min-w-[90px]">{mod.replace(/_/g, " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role, ri) => {
                  const isSuper = role === "SUPER_ADMIN";
                  return (
                    <tr key={role} className={`border-b border-gray-100 hover:bg-gray-50/50 ${isSuper ? "bg-blue-50/30" : ""}`}>
                      <td className="px-3 py-2.5 sticky left-0 bg-inherit font-medium text-gray-800 text-sm whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Shield className={`size-3.5 ${isSuper ? "text-blue-600" : "text-gray-400"}`} />
                          <span>{ROLE_LABELS[role] ?? role.replace(/_/g, " ")}</span>
                          {enabledRoles.includes(role) && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">active</Badge>}
                        </div>
                      </td>
                      {filteredModules.map((mod) => {
                        const perms = getRolePermissions(role, mod);
                        const changed = !!matrix[role]?.[mod];
                        return (
                          <td key={mod} className={`px-2 py-2 text-center ${changed ? "bg-amber-50" : ""}`}>
                            <div className="flex flex-wrap gap-0.5 justify-center min-w-[80px]">
                              {PERMISSIONS.map((perm) => {
                                const active = perms.includes(perm);
                                return (
                                  <button
                                    key={perm}
                                    onClick={() => togglePermission(role, mod, perm)}
                                    className={`text-[9px] uppercase px-1 py-0.5 rounded transition-colors ${
                                      active
                                        ? "bg-blue-600 text-white font-semibold"
                                        : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                    }`}
                                    title={`${perm} - ${ROLE_LABELS[role]} / ${mod}`}
                                  >
                                    {perm[0]}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="font-medium">Permissions:</span>
            {PERMISSIONS.map((p) => (
              <span key={p} className="flex items-center gap-1">
                <span className="inline-block w-4 h-4 rounded bg-blue-600 text-white text-[8px] flex items-center justify-center font-bold">{p[0].toUpperCase()}</span>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

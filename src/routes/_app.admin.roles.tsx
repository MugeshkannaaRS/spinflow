import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, mastersApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useMemo, Fragment } from "react";
import { toast } from "sonner";
import {
  Shield,
  Building2,
  Loader2,
  Save,
  RotateCcw,
  Info,
  CheckCircle2,
  XCircle,
  Minus,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/roles")({
  head: () => ({ meta: [{ title: "Role-Module Matrix — Admin — SpinFlow ERP" }] }),
  component: RoleMatrixPage,
});

// ── System defaults (mirror of backend rbac.py ACCESS_MATRIX) ─────────────
const SYSTEM_ACCESS: Record<string, Record<string, true | "read">> = {
  SUPER_ADMIN: {
    dashboard: true,
    production: true,
    quality: true,
    inventory: true,
    dispatch: true,
    purchase: true,
    stores: true,
    hr: true,
    accounts: true,
    maintenance: true,
    payroll: true,
    sales: true,
    lotrac: true,
    reports: true,
    stock: true,
    audit: true,
    users: true,
    masters: true,
    uploads: true,
    analytics: true,
    whatsapp: true,
    lc_tracking: true,
  },
  MILL_OWNER: {
    dashboard: true,
    production: true,
    quality: true,
    inventory: true,
    dispatch: true,
    purchase: true,
    stores: true,
    hr: true,
    accounts: true,
    maintenance: true,
    payroll: true,
    sales: true,
    lotrac: true,
    reports: true,
    stock: true,
    audit: true,
    users: true,
    masters: true,
    uploads: true,
    analytics: true,
    whatsapp: true,
    lc_tracking: true,
  },
  GENERAL_MANAGER: {
    dashboard: true,
    production: true,
    quality: true,
    maintenance: true,
    stores: true,
    inventory: true,
    dispatch: true,
    purchase: true,
    lotrac: true,
    reports: true,
    stock: true,
    sales: true,
    uploads: true,
    analytics: true,
    lc_tracking: true,
    hr: "read",
    payroll: "read",
    accounts: "read",
    audit: "read",
    masters: "read",
  },
  PRODUCTION_MANAGER: {
    dashboard: true,
    production: true,
    maintenance: "read",
    quality: "read",
    inventory: "read",
    stock: "read",
    reports: true,
    uploads: true,
    analytics: true,
  },
  QUALITY_MANAGER: {
    dashboard: true,
    quality: true,
    production: "read",
    inventory: "read",
    stock: "read",
    reports: true,
    uploads: true,
  },
  DISPATCH_MANAGER: {
    dashboard: true,
    dispatch: true,
    lotrac: true,
    stores: true,
    inventory: true,
    sales: "read",
    stock: "read",
    reports: true,
    uploads: true,
  },
  STORE_MANAGER: {
    dashboard: true,
    stores: true,
    inventory: true,
    purchase: "read",
    maintenance: "read",
    reports: true,
    stock: true,
    uploads: true,
  },
  HR_MANAGER: { dashboard: true, hr: true, payroll: true, reports: true, uploads: true },
  ACCOUNTANT: {
    dashboard: true,
    accounts: true,
    payroll: true,
    purchase: "read",
    dispatch: "read",
    sales: "read",
    reports: true,
    lc_tracking: true,
    uploads: true,
  },
  MAINTENANCE_MANAGER: {
    dashboard: true,
    maintenance: true,
    stores: "read",
    production: "read",
    reports: true,
    uploads: true,
  },
  SUPERVISOR: { dashboard: true, production: true, reports: true },
  MACHINE_OPERATOR: { dashboard: true, production: true },
  SECURITY_GATE: { dashboard: true, dispatch: "read", lotrac: true },
  AUDITOR: {
    dashboard: true,
    production: "read",
    quality: "read",
    hr: "read",
    accounts: "read",
    reports: true,
    audit: true,
    inventory: "read",
    stores: "read",
    dispatch: "read",
    maintenance: "read",
  },
  OPERATOR: { dashboard: true, production: true, quality: "read", stores: "read", reports: "read" },
};

const ROLE_GROUPS = [
  { label: "Admin", roles: ["SUPER_ADMIN", "MILL_OWNER"] },
  {
    label: "Management",
    roles: [
      "GENERAL_MANAGER",
      "PRODUCTION_MANAGER",
      "QUALITY_MANAGER",
      "DISPATCH_MANAGER",
      "STORE_MANAGER",
      "HR_MANAGER",
      "ACCOUNTANT",
      "MAINTENANCE_MANAGER",
    ],
  },
  {
    label: "Operations",
    roles: ["SUPERVISOR", "MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR", "OPERATOR"],
  },
];

const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  MILL_OWNER: "Mill Owner",
  GENERAL_MANAGER: "General Manager",
  PRODUCTION_MANAGER: "Production Mgr",
  QUALITY_MANAGER: "Quality Mgr",
  DISPATCH_MANAGER: "Dispatch Mgr",
  STORE_MANAGER: "Store Mgr",
  HR_MANAGER: "HR Manager",
  ACCOUNTANT: "Accountant",
  MAINTENANCE_MANAGER: "Maintenance Mgr",
  SUPERVISOR: "Supervisor",
  MACHINE_OPERATOR: "Machine Op.",
  SECURITY_GATE: "Security Gate",
  AUDITOR: "Auditor",
  OPERATOR: "Operator",
};

const MODULE_GROUPS = [
  {
    label: "Core",
    modules: [
      "production",
      "quality",
      "inventory",
      "dispatch",
      "purchase",
      "stores",
      "hr",
      "accounts",
      "maintenance",
    ],
  },
  {
    label: "Add-ons",
    modules: [
      "payroll",
      "sales",
      "lotrac",
      "reports",
      "stock",
      "uploads",
      "analytics",
      "whatsapp",
      "lc_tracking",
    ],
  },
  { label: "System", modules: ["dashboard", "audit", "users", "masters"] },
];

const ALL_MODULES = MODULE_GROUPS.flatMap((g) => g.modules);

const MODULE_LABELS: Record<string, string> = {
  production: "Production",
  quality: "Quality",
  inventory: "Inventory",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  accounts: "Accounts",
  maintenance: "Maintenance",
  payroll: "Payroll",
  sales: "Sales",
  lotrac: "LoTrac",
  reports: "Reports",
  stock: "Stock",
  uploads: "Uploads",
  analytics: "Analytics",
  whatsapp: "WhatsApp",
  lc_tracking: "LC Track",
  dashboard: "Dashboard",
  audit: "Audit",
  users: "Users",
  masters: "Masters",
};

type Override = true | false | null;
type OverrideMatrix = Record<string, Record<string, Override>>;

function systemLevel(role: string, module: string): true | "read" | null {
  return (SYSTEM_ACCESS[role]?.[module] as true | "read" | undefined) ?? null;
}

function CellChip({
  role,
  module,
  override,
  onChange,
}: {
  role: string;
  module: string;
  override: Override;
  onChange: (v: Override) => void;
}) {
  const sys = systemLevel(role, module);
  const isProtected = role === "SUPER_ADMIN" || role === "MILL_OWNER";

  const cycle = () => {
    if (isProtected) return;
    if (override === null) onChange(true);
    else if (override === true) onChange(false);
    else onChange(null);
  };

  if (isProtected) {
    return (
      <div className="flex justify-center">
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
          <CheckCircle2 className="size-2.5" /> Full
        </span>
      </div>
    );
  }

  if (override === true) {
    return (
      <button
        onClick={cycle}
        title="Override: ALLOWED — click to cycle"
        className="flex justify-center w-full"
      >
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500 text-white ring-2 ring-emerald-300">
          <CheckCircle2 className="size-2.5" /> ON
        </span>
      </button>
    );
  }

  if (override === false) {
    return (
      <button
        onClick={cycle}
        title="Override: DENIED — click to cycle"
        className="flex justify-center w-full"
      >
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500 text-white ring-2 ring-red-300">
          <XCircle className="size-2.5" /> OFF
        </span>
      </button>
    );
  }

  if (sys === true) {
    return (
      <button
        onClick={cycle}
        title="System default: full write — click to override"
        className="flex justify-center w-full"
      >
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
          <CheckCircle2 className="size-2.5" /> W
        </span>
      </button>
    );
  }

  if (sys === "read") {
    return (
      <button
        onClick={cycle}
        title="System default: read-only — click to override"
        className="flex justify-center w-full"
      >
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-100 text-sky-700">
          <Info className="size-2.5" /> R
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={cycle}
      title="No access — click to grant override"
      className="flex justify-center w-full"
    >
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] text-gray-300 hover:bg-gray-100 hover:text-gray-500 transition-colors">
        <Minus className="size-2.5" />
      </span>
    </button>
  );
}

function RoleMatrixPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [localOverrides, setLocalOverrides] = useState<OverrideMatrix>({});
  const [isDirty, setIsDirty] = useState(false);

  const companiesQ = useQuery({
    queryKey: ["masters-companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
  });
  const companies: any[] = Array.isArray(companiesQ.data) ? companiesQ.data : [];

  const roleModulesQ = useQuery({
    queryKey: ["role-modules", companyId],
    queryFn: () => adminApi.getRoleModules(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
    select: (data: any): OverrideMatrix => {
      // Backend: {company_id, overrides: {role_code: {module_name: bool}}}
      const raw: Record<string, Record<string, boolean>> = data?.overrides ?? {};
      const matrix: OverrideMatrix = {};
      for (const role of ALL_ROLES) {
        matrix[role] = {};
        for (const mod of ALL_MODULES) {
          const val = raw[role]?.[mod];
          matrix[role][mod] = val === undefined ? null : val;
        }
      }
      return matrix;
    },
  });

  const savedMatrix: OverrideMatrix = roleModulesQ.data ?? {};

  const effectiveMatrix: OverrideMatrix = useMemo(() => {
    const merged: OverrideMatrix = {};
    for (const role of ALL_ROLES) {
      merged[role] = { ...(savedMatrix[role] ?? {}), ...(localOverrides[role] ?? {}) };
    }
    return merged;
  }, [savedMatrix, localOverrides]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, Record<string, boolean>> = {};
      for (const role of ALL_ROLES) {
        if (role === "SUPER_ADMIN" || role === "MILL_OWNER") continue;
        for (const mod of ALL_MODULES) {
          const v = effectiveMatrix[role]?.[mod];
          if (v !== null && v !== undefined) {
            payload[role] = payload[role] ?? {};
            payload[role][mod] = v as boolean;
          }
        }
      }
      return adminApi.updateRoleModules(companyId, payload);
    },
    onSuccess: () => {
      toast.success("Role-module matrix saved");
      setLocalOverrides({});
      setIsDirty(false);
      qc.invalidateQueries({ queryKey: ["role-modules", companyId] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Save failed"),
  });

  const handleChange = (role: string, module: string, value: Override) => {
    setLocalOverrides((prev) => ({
      ...prev,
      [role]: { ...(prev[role] ?? {}), [module]: value },
    }));
    setIsDirty(true);
  };

  const clearRoleOverrides = (role: string) => {
    setLocalOverrides((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
    // Build payload without this role's overrides and save
    const payload: Record<string, Record<string, boolean>> = {};
    for (const r of ALL_ROLES) {
      if (r === role || r === "SUPER_ADMIN" || r === "MILL_OWNER") continue;
      for (const mod of ALL_MODULES) {
        const v = savedMatrix[r]?.[mod];
        if (v !== null && v !== undefined) {
          payload[r] = payload[r] ?? {};
          payload[r][mod] = v as boolean;
        }
      }
    }
    adminApi
      .updateRoleModules(companyId, payload)
      .then(() => {
        toast.success(`Overrides cleared for ${ROLE_LABELS[role] ?? role}`);
        qc.invalidateQueries({ queryKey: ["role-modules", companyId] });
      })
      .catch(() => toast.error("Failed to clear overrides"));
  };

  const dirtyCount = Object.values(localOverrides).reduce(
    (sum, mods) => sum + Object.keys(mods).length,
    0,
  );

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive font-medium">Super Admin access only.</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="size-5 text-blue-600" /> Role-Module Matrix
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-company overrides of system role defaults. Click cells to cycle: default → allow →
            deny.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLocalOverrides({});
                setIsDirty(false);
              }}
            >
              <RotateCcw className="size-3.5 mr-1.5" /> Discard
            </Button>
          )}
          <Button
            size="sm"
            disabled={!companyId || !isDirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin mr-1.5" />
            ) : (
              <Save className="size-3.5 mr-1.5" />
            )}
            Save{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {/* Company selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Building2 className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium">Company</span>
            </div>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value);
                setLocalOverrides({});
                setIsDirty(false);
              }}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white min-w-[260px]"
            >
              <option value="">Select a company…</option>
              {companies.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {!companyId ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Shield className="size-12 text-muted-foreground/30 mb-4" />
          <p className="font-medium text-muted-foreground">
            Select a company to configure its role-module matrix
          </p>
        </div>
      ) : roleModulesQ.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground items-center">
            <span className="font-medium text-foreground">Legend:</span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium text-[10px]">
                W
              </span>
              System write
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 font-medium text-[10px]">
                R
              </span>
              System read
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500 text-white font-semibold text-[10px]">
                ON
              </span>
              Override: allow
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500 text-white font-semibold text-[10px]">
                OFF
              </span>
              Override: deny
            </span>
            <span className="flex items-center gap-1.5">
              <Minus className="size-3 text-gray-300" /> No default access
            </span>
          </div>

          {/* Matrix table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-500 min-w-[155px] border-r border-gray-200">
                    Role
                  </th>
                  {MODULE_GROUPS.map((g, gi) => (
                    <th
                      key={g.label}
                      colSpan={g.modules.length}
                      className={`px-2 py-1.5 text-center font-semibold text-gray-500 ${gi < MODULE_GROUPS.length - 1 ? "border-r border-gray-200" : ""}`}
                    >
                      {g.label}
                    </th>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="sticky left-0 bg-gray-50 px-3 py-2 border-r border-gray-200" />
                  {MODULE_GROUPS.flatMap((g, gi) =>
                    g.modules.map((mod, mi) => (
                      <th
                        key={mod}
                        className={`px-0.5 py-2 text-center font-medium text-gray-600 min-w-[60px] ${mi === g.modules.length - 1 && gi < MODULE_GROUPS.length - 1 ? "border-r border-gray-200" : ""}`}
                      >
                        {MODULE_LABELS[mod] ?? mod}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {ROLE_GROUPS.map((group) => (
                  <Fragment key={group.label}>
                    <tr key={`grp-${group.label}`} className="bg-gray-50/70">
                      <td
                        colSpan={ALL_MODULES.length + 1}
                        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.roles.map((role) => {
                      const hasLocal = Object.keys(localOverrides[role] ?? {}).length > 0;
                      const hasSaved = Object.values(savedMatrix[role] ?? {}).some(
                        (v) => v !== null,
                      );
                      return (
                        <tr
                          key={role}
                          className="border-b border-gray-100 hover:bg-gray-50/40 transition-colors"
                        >
                          <td className="sticky left-0 bg-white border-r border-gray-100 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <Shield
                                  className={`size-3 shrink-0 ${role === "SUPER_ADMIN" || role === "MILL_OWNER" ? "text-blue-500" : "text-gray-300"}`}
                                />
                                <span className="font-medium text-gray-800 whitespace-nowrap">
                                  {ROLE_LABELS[role] ?? role}
                                </span>
                              </div>
                              {(hasLocal || hasSaved) &&
                                role !== "SUPER_ADMIN" &&
                                role !== "MILL_OWNER" && (
                                  <button
                                    onClick={() => clearRoleOverrides(role)}
                                    title="Clear all overrides for this role"
                                    className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                                  >
                                    <RotateCcw className="size-3" />
                                  </button>
                                )}
                            </div>
                          </td>
                          {MODULE_GROUPS.flatMap((g, gi) =>
                            g.modules.map((mod, mi) => (
                              <td
                                key={mod}
                                className={`py-1.5 px-0.5 ${mi === g.modules.length - 1 && gi < MODULE_GROUPS.length - 1 ? "border-r border-gray-200" : ""} ${localOverrides[role]?.[mod] !== undefined ? "bg-amber-50/50" : ""}`}
                              >
                                <CellChip
                                  role={role}
                                  module={mod}
                                  override={effectiveMatrix[role]?.[mod] ?? null}
                                  onChange={(v) => handleChange(role, mod, v)}
                                />
                              </td>
                            )),
                          )}
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {isDirty && (
            <p className="text-xs text-amber-600 font-medium">
              {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""} — click Save to apply.
            </p>
          )}
        </>
      )}
    </div>
  );
}

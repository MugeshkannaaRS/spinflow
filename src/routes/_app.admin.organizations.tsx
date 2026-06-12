import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Building2, Factory, Users, Shield, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/admin/organizations")({
  head: () => ({ meta: [{ title: "Organizations — Admin — SpinFlow ERP" }] }),
  component: OrganizationsPage,
});

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  growth: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  business: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  unlimited: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function OrganizationsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });
  const statsQ = useQuery({
    queryKey: ["admin-company-stats"],
    queryFn: () => adminApi.getCompanyStats(),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const companies: any[] = (companiesQ.data ?? []) as any[];
  const companyStats: any[] = (statsQ.data?.company_stats ?? []) as any[];
  const statsMap = new Map(companyStats.map((s: any) => [s.company_id, s]));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Management</h1>
        <p className="text-sm text-muted-foreground mt-1">License overview, user provisioning, and subscription enforcement.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Organizations</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{companies.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{companies.filter((c: any) => c.is_active !== false).length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Users</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{companyStats.reduce((a: number, s: any) => a + (s.user_count ?? 0), 0)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Mills</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{companyStats.reduce((a: number, s: any) => a + (s.mill_count ?? 0), 0)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorBoundary inline label="Organizations">
          <DataTable
            tableId="admin_organizations"
            columns={[
              { key: "name", label: "Company", render: (c: any) => (
                <div>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">{c.code}</span>
                </div>
              )},
              { key: "_users", label: "User Usage", render: (c: any) => {
                const current = statsMap.get(c.id)?.user_count ?? 0;
                const max = c.max_users ?? 50;
                const pct = max > 0 ? (current / max) * 100 : 0;
                return (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{current}</span>
                    <span className="text-muted-foreground">/ {max}</span>
                    {pct >= 100 ? (
                      <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded">FULL</span>
                    ) : pct >= 90 ? (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400 px-1.5 py-0.5 rounded">{Math.round(pct)}%</span>
                    ) : null}
                  </div>
                );
              }},
              { key: "_mills", label: "Mills", render: (c: any) => statsMap.get(c.id)?.mill_count ?? 0 },
              { key: "plan", label: "Plan", render: (c: any) => {
                const plan = c.plan ?? c.subscription_plan ?? "starter";
                return (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${PLAN_COLORS[plan] ?? PLAN_COLORS.starter}`}>
                    {plan}
                  </span>
                );
              }},
              { key: "is_active", label: "Status", render: (c: any) => (
                <span className={c.is_active
                  ? "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                }>
                  {c.is_active ? "Active" : "Suspended"}
                </span>
              )},
            ] satisfies ColDef[]}
            data={companies}
            rowKey={(c: any) => c.id}
            exportFilename="organizations"
          />
          </ErrorBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

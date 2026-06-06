import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtLakh } from "@/lib/formatters";
import {
  Building2, Factory, SlidersHorizontal, CreditCard, Archive, FileText,
  Blocks, Shield, Users, TrendingUp, DollarSign, AlertTriangle,
  CheckCircle2, XCircle, ArrowUpRight, Loader2, Receipt, ShoppingCart,
  UserPlus, Activity, Bell,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — SpinFlow ERP" }] }),
  component: AdminPage,
});

const SECTIONS = [
  { id: "companies", label: "Companies", icon: Building2, desc: "Manage companies, plans, and modules", color: "bg-blue-50 text-blue-600" },
  { id: "mills", label: "Mills", icon: Factory, desc: "View and manage mills across companies", color: "bg-indigo-50 text-indigo-600" },
  { id: "users", label: "Users", icon: Users, desc: "Provision, manage, and enforce user limits", color: "bg-green-50 text-green-600" },
  { id: "organizations", label: "Organizations", icon: Shield, desc: "Company overview, usage, and limits", color: "bg-teal-50 text-teal-600" },
  { id: "modules", label: "Module Manager", icon: Blocks, desc: "Toggle module access per company", color: "bg-purple-50 text-purple-600" },
  { id: "limits", label: "User Limits", icon: SlidersHorizontal, desc: "Monitor and adjust user limits", color: "bg-amber-50 text-amber-600" },
  { id: "audit", label: "Audit Logs", icon: FileText, desc: "View audit trail across all companies", color: "bg-rose-50 text-rose-600" },
  { id: "alerts", label: "Alert Center", icon: Bell, desc: "Invoice overdue, limits reached, expiring subscriptions", color: "bg-red-50 text-red-600" },
  { id: "billing", label: "Billing", icon: CreditCard, desc: "Subscriptions, invoicing, plans, and revenue analytics", color: "bg-teal-50 text-teal-600" },
  { id: "archive", label: "Archive", icon: Archive, desc: "View and restore suspended companies", color: "bg-gray-50 text-gray-600" },
  { id: "column-config", label: "Column Config", icon: SlidersHorizontal, desc: "Configure table column visibility", color: "bg-orange-50 text-orange-600" },
];

function AdminPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/admin";

  const statsQ = useQuery({
    queryKey: ["admin-global-stats"],
    queryFn: () => api.get("/admin/company-stats").then(r => {
      const data: any[] = Array.isArray(r.data) ? r.data : [];
      return {
        total_companies: data.length,
        total_mills: data.reduce((a: number, s: any) => a + (s.mill_count ?? 0), 0),
        total_users: data.reduce((a: number, s: any) => a + (s.user_count ?? 0), 0),
      };
    }),
    staleTime: 30_000,
  });

  const dashboardQ = useQuery({
    queryKey: ["admin-billing-dashboard"],
    queryFn: () => api.get("/admin/billing/dashboard").then(r => r.data),
    staleTime: 60_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 60_000,
  });

  const pendingUpgradesQ = useQuery({
    queryKey: ["admin-pending-upgrades"],
    queryFn: () => api.get("/subscription/change-requests", { params: { status: "pending" } }).then(r => r.data),
    staleTime: 30_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () => api.get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } }).then(r => r.data),
    staleTime: 60_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  if (isChildRoute) {
    return <Outlet />;
  }

  const stats = statsQ.data;
  const dd = dashboardQ.data;
  const an = analyticsQ.data;
  const pending = pendingUpgradesQ.data;
  const subs = subsQ.data;

  const subsList: any[] = Array.isArray(subs?.items) ? subs.items : [];
  const nearLimitCompanies = subsList.filter((s: any) =>
    s.user_count >= s.user_limit * 0.85 ||
    s.mill_count >= s.mill_limit * 0.85 ||
    (s.employee_count ?? 0) >= (s.employee_limit ?? 9999) * 0.85
  );
  const topCustomers: any[] = Array.isArray(an?.top_customers) ? an.top_customers : [];
  const pendingUpgrades: any[] = Array.isArray(pending) ? pending : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">SaaS operations, revenue, and company oversight</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="size-4 text-emerald-500" />
          Live
        </div>
      </div>

      {/* KPI Cards */}
      {(dd || an) && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="MRR" value={fmtLakh(dd?.mrr ?? 0)} subLabel="Monthly Recurring Revenue" icon={TrendingUp} iconColor="text-blue-600" iconBg="bg-blue-50" />
          <KpiCard label="ARR" value={fmtLakh(dd?.arr ?? 0)} subLabel="Annual Recurring Revenue" icon={DollarSign} iconColor="text-green-600" iconBg="bg-green-50" />
          <KpiCard label="Revenue Growth" value={dd ? `${(dd.revenue_growth ?? 0).toFixed(1)}%` : "—"} subLabel="vs last month" icon={ArrowUpRight} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
          <KpiCard label="New Customers" value={String(dd?.new_customers_this_month ?? 0)} subLabel="This month" icon={UserPlus} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
          <KpiCard label="Collection Rate" value={dd ? `${(dd.collection_rate ?? 0).toFixed(0)}%` : "—"} subLabel="Overall" icon={CheckCircle2} iconColor="text-purple-600" iconBg="bg-purple-50" />
          <KpiCard label="Overdue Revenue" value={fmtLakh(dd?.overdue_companies ?? 0)} subLabel="Overdue accounts" icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_companies ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{dd?.active_subscriptions ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Suspended</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{dd?.suspended_companies ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Churn Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{an ? `${an.churn_rate}%` : "..."}</div>
          </CardContent>
        </Card>
      </div>

      {/* Companies Near Limits + Open Upgrade Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Companies Near Limits</CardTitle>
            <AlertTriangle className="size-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {nearLimitCompanies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="size-8 text-emerald-400 mb-2" />
                <p className="text-sm text-muted-foreground">All companies within limits</p>
              </div>
            ) : (
              <div className="space-y-2">
                {nearLimitCompanies.slice(0, 10).map((s: any) => {
                  const flags: string[] = [];
                  if (s.user_count >= s.user_limit * 0.85) flags.push(`Users ${s.user_count}/${s.user_limit}`);
                  if (s.mill_count >= s.mill_limit * 0.85) flags.push(`Mills ${s.mill_count}/${s.mill_limit}`);
                  if ((s.employee_count ?? 0) >= (s.employee_limit ?? 9999) * 0.85) flags.push(`Employees ${s.employee_count}/${s.employee_limit}`);
                  return (
                    <div key={s.company_id} className="flex items-center justify-between p-2 rounded-lg border border-amber-100 bg-amber-50/50">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.company_name}</p>
                        <p className="text-xs text-muted-foreground">{flags.join(", ")}</p>
                      </div>
                      <button onClick={() => navigate({ to: `/admin/companies/${s.company_id}` as any })} className="text-xs text-blue-600 hover:underline shrink-0 ml-2">View</button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Open Upgrade Requests</CardTitle>
            <ShoppingCart className="size-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {pendingUpgrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="size-8 text-emerald-400 mb-2" />
                <p className="text-sm text-muted-foreground">No pending upgrade requests</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingUpgrades.map((cr: any) => (
                  <div key={cr.id} className="flex items-center justify-between p-2 rounded-lg border border-blue-100 bg-blue-50/50">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{cr.change_type} request</p>
                      <p className="text-xs text-muted-foreground">{cr.reason || "No reason provided"}</p>
                    </div>
                    <button onClick={() => navigate({ to: "/admin/billing" })} className="text-xs text-blue-600 hover:underline shrink-0 ml-2">Review</button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Customers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Top Customers by Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No customer revenue data yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">#</th>
                    <th className="pb-2 font-medium">Company</th>
                    <th className="pb-2 font-medium text-right">Total Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 text-muted-foreground w-8">{i + 1}</td>
                      <td className="py-2 font-medium">{c.company_name}</td>
                      <td className="py-2 text-right font-mono">₹{c.total_paid.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation Sections */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin Sections</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => navigate({ to: `/admin/${s.id}` })}
              className="text-left p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white"
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color} mb-3`}>
                <s.icon className="size-5" />
              </div>
              <h3 className="font-semibold text-sm">{s.label}</h3>
              <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

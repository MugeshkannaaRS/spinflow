import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtLakh } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Building2, Factory, SlidersHorizontal, CreditCard, Archive, FileText,
  Blocks, Shield, Users, TrendingUp, DollarSign, AlertTriangle,
  CheckCircle2, XCircle, ArrowUpRight, Loader2, Receipt, ShoppingCart,
  UserPlus, Activity, Bell, ChevronDown, UserCog,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — SpinFlow ERP" }] }),
  component: AdminPage,
});

// Grouped admin sections — each group is an accordion on the admin page
const SECTION_GROUPS = [
  {
    id: "companies",
    label: "Company Management",
    icon: Building2,
    color: "bg-blue-50 text-blue-600 border-blue-100",
    items: [
      { id: "companies",     label: "Companies",      icon: Building2,       desc: "Manage companies, plans, modules" },
      { id: "mills",         label: "Mills",           icon: Factory,         desc: "View and manage mills across companies" },
      { id: "organizations", label: "Organizations",   icon: Shield,          desc: "Company overview, usage and limits" },
      { id: "archive",       label: "Archive",         icon: Archive,         desc: "View and restore suspended companies" },
    ],
  },
  {
    id: "users",
    label: "User Management",
    icon: UserCog,
    color: "bg-green-50 text-green-600 border-green-100",
    items: [
      { id: "users",   label: "Users",       icon: Users,           desc: "Provision, manage and enforce user limits" },
      { id: "limits",  label: "User Limits", icon: SlidersHorizontal, desc: "Monitor and adjust user limits" },
      { id: "modules", label: "Modules",     icon: Blocks,          desc: "Toggle module access per company" },
    ],
  },
  {
    id: "billing",
    label: "Billing & Revenue",
    icon: CreditCard,
    color: "bg-teal-50 text-teal-600 border-teal-100",
    items: [
      { id: "billing",  label: "Billing",      icon: CreditCard, desc: "Subscriptions, invoicing, plans, revenue" },
      { id: "alerts",   label: "Alert Center", icon: Bell,        desc: "Overdue invoices, limits, expiring subs" },
    ],
  },
  {
    id: "system",
    label: "System & Config",
    icon: SlidersHorizontal,
    color: "bg-orange-50 text-orange-600 border-orange-100",
    items: [
      { id: "audit",         label: "Audit Logs",    icon: FileText,          desc: "Full audit trail across all companies" },
      { id: "column-config", label: "Column Config", icon: SlidersHorizontal, desc: "Configure table column visibility" },
    ],
  },
];

// ── Near Limit row with inline action dropdown ────────────────────────────────
function NearLimitRow({ company: s, flags, navigate }: { company: any; flags: string[]; navigate: (o: { to: string }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex items-center justify-between p-2 rounded-lg border border-amber-100 bg-amber-50/50">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{s.company_name}</p>
        <p className="text-xs text-muted-foreground">{flags.join(", ")}</p>
      </div>
      <div className="relative shrink-0 ml-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Actions <ChevronDown className={cn("size-3 transition-transform", open ? "rotate-180" : "")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
              <button
                onClick={() => { setOpen(false); navigate({ to: `/admin/companies/${s.company_id}` as any }); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <Building2 className="size-3.5 text-blue-500" /> View Detail
              </button>
              <button
                onClick={() => { setOpen(false); navigate({ to: `/admin/billing` }); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <CreditCard className="size-3.5 text-green-500" /> Adjust Limits
              </button>
              <button
                onClick={() => { setOpen(false); navigate({ to: `/admin/companies` }); }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <Users className="size-3.5 text-purple-500" /> Manage Users
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Accordion group state — all open by default
function AccordionGroup({ group, navigate }: { group: typeof SECTION_GROUPS[0]; navigate: (opts: { to: string }) => void }) {
  const [open, setOpen] = useState(true);
  const GroupIcon = group.icon;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center border text-sm", group.color)}>
            <GroupIcon className="size-4" />
          </div>
          <span className="font-semibold text-sm text-gray-800">{group.label}</span>
          <span className="text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded-full">
            {group.items.length}
          </span>
        </div>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open ? "rotate-0" : "-rotate-90")} />
      </button>
      {open && (
        <div className="border-t border-gray-100 grid grid-cols-1 divide-y divide-gray-50">
          {group.items.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate({ to: `/admin/${item.id}` })}
                className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left group"
              >
                <Icon className="size-4 text-muted-foreground group-hover:text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700 group-hover:text-blue-700">{item.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{item.desc}</div>
                </div>
                <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 ml-auto shrink-0 transition-opacity" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

  const anyLoading = statsQ.isLoading || dashboardQ.isLoading || analyticsQ.isLoading || pendingUpgradesQ.isLoading || subsQ.isLoading;
  const anyError = statsQ.isError || dashboardQ.isError || analyticsQ.isError || pendingUpgradesQ.isError || subsQ.isError;

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
        <div className="flex items-center gap-2">
          {anyLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading…</span>
          ) : anyError ? (
            <span className="flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="size-3.5" /> Some data failed to load</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600"><Activity className="size-3.5" /> Live</span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {anyError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">
              {[
                statsQ.isError && "Stats",
                dashboardQ.isError && "Dashboard",
                analyticsQ.isError && "Analytics",
                pendingUpgradesQ.isError && "Upgrade requests",
                subsQ.isError && "Subscriptions",
              ].filter(Boolean).join(", ")} failed to load.
            </p>
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => {
            statsQ.refetch(); dashboardQ.refetch(); analyticsQ.refetch(); pendingUpgradesQ.refetch(); subsQ.refetch();
          }}>Retry All</Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {anyLoading && !dd && !an ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-3 w-14 bg-muted rounded animate-pulse mb-2" /><div className="h-6 w-20 bg-muted rounded animate-pulse" /><div className="h-2 w-24 bg-muted rounded animate-pulse mt-2" /></CardContent></Card>
          ))
        ) : (
          <>
            <KpiCard label="MRR" value={fmtLakh(dd?.mrr ?? 0)} subLabel="Monthly Recurring Revenue" icon={TrendingUp} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <KpiCard label="ARR" value={fmtLakh(dd?.arr ?? 0)} subLabel="Annual Recurring Revenue" icon={DollarSign} iconColor="text-green-600" iconBg="bg-green-50" />
            <KpiCard label="Revenue Growth" value={dd ? `${(dd.revenue_growth ?? 0).toFixed(1)}%` : "—"} subLabel="vs last month" icon={ArrowUpRight} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="New Customers" value={String(dd?.new_customers_this_month ?? 0)} subLabel="This month" icon={UserPlus} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
            <KpiCard label="Collection Rate" value={dd ? `${(dd.collection_rate ?? 0).toFixed(0)}%` : "—"} subLabel="Overall" icon={CheckCircle2} iconColor="text-purple-600" iconBg="bg-purple-50" />
            <KpiCard label="Overdue Revenue" value={fmtLakh(dd?.overdue_companies ?? 0)} subLabel="Overdue accounts" icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
          </>
        )}
      </div>

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
                    <NearLimitRow key={s.company_id} company={s} flags={flags} navigate={navigate} />
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

      {/* Navigation Sections — grouped accordion dropdowns */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Admin Sections</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4">
          {SECTION_GROUPS.map(group => (
            <AccordionGroup key={group.id} group={group} navigate={navigate} />
          ))}
        </div>
      </div>
    </div>
  );
}

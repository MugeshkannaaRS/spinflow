import {
  createFileRoute,
  Outlet,
  useRouterState,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { KpiCard } from "@/components/ui/KpiCard";
import { fmtLakh } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Building2,
  Factory,
  SlidersHorizontal,
  CreditCard,
  Archive,
  FileText,
  Blocks,
  Shield,
  Users,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Loader2,
  ShoppingCart,
  UserPlus,
  Activity,
  Bell,
  ChevronDown,
  UserCog,
  Server,
  CheckSquare,
  Flag,
  Database,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — SpinFlow ERP" }] }),
  beforeLoad: () => {
    const { user } = useAuth.getState();
    if (!user || user.role !== "SUPER_ADMIN") {
      throw redirect({ to: "/dashboard" });
    }
  },
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
      {
        id: "companies",
        label: "Companies",
        icon: Building2,
        desc: "Manage companies, plans, modules",
      },
      {
        id: "mills",
        label: "Mills",
        icon: Factory,
        desc: "View and manage mills across companies",
      },
      {
        id: "organizations",
        label: "Organizations",
        icon: Shield,
        desc: "Company overview, usage and limits",
      },
      {
        id: "archive",
        label: "Archive",
        icon: Archive,
        desc: "View and restore suspended companies",
      },
    ],
  },
  {
    id: "users",
    label: "User Management",
    icon: UserCog,
    color: "bg-green-50 text-green-600 border-green-100",
    items: [
      {
        id: "users",
        label: "Users",
        icon: Users,
        desc: "Provision, manage and enforce user limits",
      },
      {
        id: "limits",
        label: "User Limits",
        icon: SlidersHorizontal,
        desc: "Monitor and adjust user limits",
      },
      { id: "modules", label: "Modules", icon: Blocks, desc: "Toggle module access per company" },
      {
        id: "roles",
        label: "Role Permissions",
        icon: Shield,
        desc: "Role-module permission matrix",
      },
    ],
  },
  {
    id: "billing",
    label: "Billing & Revenue",
    icon: CreditCard,
    color: "bg-teal-50 text-teal-600 border-teal-100",
    items: [
      {
        id: "billing",
        label: "Billing",
        icon: CreditCard,
        desc: "Subscriptions, invoicing, plans, revenue",
      },
      {
        id: "billing/command-center",
        label: "Command Center",
        icon: BarChart3,
        desc: "Unified billing command center",
      },
      {
        id: "alerts",
        label: "Alert Center",
        icon: Bell,
        desc: "Overdue invoices, limits, expiring subs",
      },
    ],
  },
  {
    id: "operations",
    label: "Operations Center",
    icon: Activity,
    color: "bg-purple-50 text-purple-600 border-purple-100",
    items: [
      {
        id: "alert-ops",
        label: "Alert Ops",
        icon: Bell,
        desc: "Alert operations with timeline, escalation, heatmaps",
      },
      {
        id: "approvals",
        label: "Approvals",
        icon: CheckSquare,
        desc: "Approval workflow inbox and management",
      },
      {
        id: "incidents",
        label: "Incidents",
        icon: Flag,
        desc: "Incident management and resolution tracking",
      },
    ],
  },
  {
    id: "platform",
    label: "Platform & Infrastructure",
    icon: Server,
    color: "bg-rose-50 text-rose-600 border-rose-100",
    items: [
      {
        id: "health",
        label: "Health Center",
        icon: Activity,
        desc: "Platform health, services, and uptime monitoring",
      },
      {
        id: "backups",
        label: "Backup Center",
        icon: Database,
        desc: "Backup management, restore, and retention policies",
      },
    ],
  },
  {
    id: "system",
    label: "System & Config",
    icon: SlidersHorizontal,
    color: "bg-orange-50 text-orange-600 border-orange-100",
    items: [
      {
        id: "analytics",
        label: "Analytics Center",
        icon: BarChart3,
        desc: "Revenue, growth, retention, and adoption analytics",
      },
      {
        id: "audit",
        label: "Audit Logs",
        icon: FileText,
        desc: "Full audit trail across all companies",
      },
      {
        id: "column-config",
        label: "Column Config",
        icon: SlidersHorizontal,
        desc: "Configure table column visibility",
      },
    ],
  },
];

// ── Near Limit row with inline action dropdown ────────────────────────────────
function NearLimitRow({
  company: s,
  flags,
  navigate,
  userPct,
  millPct,
}: {
  company: any;
  flags: string[];
  navigate: (o: { to: string }) => void;
  userPct: number;
  millPct: number;
}) {
  const [open, setOpen] = useState(false);
  const isOver = userPct >= 1 || millPct >= 1;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
      <div className={`w-2 h-2 rounded-full shrink-0 ${isOver ? "bg-red-500" : "bg-amber-400"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{s.company_name}</p>
        <p className="text-xs text-muted-foreground">{flags.join(" · ")}</p>
        <div className="flex items-center gap-2 mt-1.5">
          {s.user_limit > 0 && (
            <div className="flex items-center gap-1 flex-1 max-w-[120px]">
              <span className="text-[10px] text-muted-foreground w-6">U</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-700">
                <div
                  className={`h-1.5 rounded-full transition-all ${userPct >= 1 ? "bg-red-500" : userPct >= 0.85 ? "bg-amber-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.min(userPct * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-7 text-right">
                {Math.round(userPct * 100)}%
              </span>
            </div>
          )}
          {s.mill_limit > 0 && (
            <div className="flex items-center gap-1 flex-1 max-w-[120px]">
              <span className="text-[10px] text-muted-foreground w-6">M</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-slate-700">
                <div
                  className={`h-1.5 rounded-full transition-all ${millPct >= 1 ? "bg-red-500" : millPct >= 0.85 ? "bg-amber-400" : "bg-blue-400"}`}
                  style={{ width: `${Math.min(millPct * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground w-7 text-right">
                {Math.round(millPct * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Actions{" "}
          <ChevronDown className={cn("size-3 transition-transform", open ? "rotate-180" : "")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate({ to: `/admin/companies/${s.company_id}` as any });
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <Building2 className="size-3.5 text-blue-500" /> View Detail
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate({ to: `/admin/billing` });
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
              >
                <CreditCard className="size-3.5 text-green-500" /> Adjust Limits
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  navigate({ to: `/admin/companies` });
                }}
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

// Accordion group — closed by default so all 4 fit above the fold
function AccordionGroup({
  group,
  navigate,
}: {
  group: (typeof SECTION_GROUPS)[0];
  navigate: (opts: { to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const GroupIcon = group.icon;
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center border text-sm",
              group.color,
            )}
          >
            <GroupIcon className="size-4" />
          </div>
          <span className="font-semibold text-sm text-gray-800">{group.label}</span>
          <span className="text-xs text-muted-foreground bg-gray-100 px-1.5 py-0.5 rounded-full">
            {group.items.length}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
      </button>
      {open && (
        <div className="border-t border-gray-100 grid grid-cols-1 divide-y divide-gray-50">
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate({ to: `/admin/${item.id}` })}
                className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 hover:text-blue-700 transition-colors text-left group"
              >
                <Icon className="size-4 text-muted-foreground group-hover:text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700 group-hover:text-blue-700">
                    {item.label}
                  </div>
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
    queryFn: () =>
      api.get("/admin/company-stats").then((r) => {
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
    queryFn: () => api.get("/admin/billing/dashboard").then((r) => r.data),
    staleTime: 60_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 60_000,
  });

  const pendingUpgradesQ = useQuery({
    queryKey: ["admin-pending-upgrades"],
    queryFn: () =>
      api
        .get("/subscription/change-requests", { params: { status: "pending" } })
        .then((r) => r.data),
    staleTime: 30_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () =>
      api
        .get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } })
        .then((r) => r.data),
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

  const anyLoading =
    statsQ.isLoading ||
    dashboardQ.isLoading ||
    analyticsQ.isLoading ||
    pendingUpgradesQ.isLoading ||
    subsQ.isLoading;
  const anyError =
    statsQ.isError ||
    dashboardQ.isError ||
    analyticsQ.isError ||
    pendingUpgradesQ.isError ||
    subsQ.isError;

  const subsList: any[] = Array.isArray(subs?.items) ? subs.items : [];
  const nearLimitCompanies = subsList.filter(
    (s: any) =>
      s.user_count >= s.user_limit * 0.85 ||
      s.mill_count >= s.mill_limit * 0.85 ||
      (s.employee_count ?? 0) >= (s.employee_limit ?? 9999) * 0.85,
  );
  const pendingUpgrades: any[] = Array.isArray(pending) ? pending : [];

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executive Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            SaaS operations, revenue, and company oversight
          </p>
        </div>
        {anyLoading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </span>
        ) : anyError ? (
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertTriangle className="size-3.5" /> Some data failed to load
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-emerald-600">
            <Activity className="size-3.5" /> Live
          </span>
        )}
      </div>

      {/* ── ADMIN SECTIONS — compact accordions at top, no scroll needed ───── */}
      <div>
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
          Admin Sections
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {SECTION_GROUPS.map((group) => (
            <AccordionGroup key={group.id} group={group} navigate={navigate} />
          ))}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
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
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              failed to load.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7"
            onClick={() => {
              statsQ.refetch();
              dashboardQ.refetch();
              analyticsQ.refetch();
              pendingUpgradesQ.refetch();
              subsQ.refetch();
            }}
          >
            Retry All
          </Button>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {anyLoading && !dd && !an ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-3 w-14 bg-muted rounded animate-pulse mb-2" />
                <div className="h-6 w-20 bg-muted rounded animate-pulse" />
                <div className="h-2 w-24 bg-muted rounded animate-pulse mt-2" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <KpiCard
              label="MRR"
              value={fmtLakh(dd?.mrr ?? 0)}
              subLabel="Monthly Recurring Revenue"
              icon={TrendingUp}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
            <KpiCard
              label="ARR"
              value={fmtLakh(dd?.arr ?? 0)}
              subLabel="Annual Recurring Revenue"
              icon={DollarSign}
              iconColor="text-green-600"
              iconBg="bg-green-50"
            />
            <KpiCard
              label="Revenue Growth"
              value={dd ? `${(dd.revenue_growth ?? 0).toFixed(1)}%` : "—"}
              subLabel="vs last month"
              icon={ArrowUpRight}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <KpiCard
              label="New Customers"
              value={String(dd?.new_customers_this_month ?? 0)}
              subLabel="This month"
              icon={UserPlus}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
            />
            <KpiCard
              label="Collection Rate"
              value={dd ? `${(dd.collection_rate ?? 0).toFixed(0)}%` : "—"}
              subLabel="Overall"
              icon={CheckCircle2}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
            />
            <KpiCard
              label="Overdue Revenue"
              value={fmtLakh(dd?.overdue_companies ?? 0)}
              subLabel="Overdue accounts"
              icon={AlertTriangle}
              iconColor="text-red-600"
              iconBg="bg-red-50"
            />
          </>
        )}
      </div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: "Total Companies", value: stats?.total_companies ?? "…", color: "" },
          { label: "Active", value: dd?.active_subscriptions ?? "…", color: "text-emerald-600" },
          { label: "Suspended", value: dd?.suspended_companies ?? "…", color: "text-red-600" },
          { label: "Churn Rate", value: an ? `${an.churn_rate}%` : "…", color: "" },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Companies Near Limits + Upgrade Requests — at bottom ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Near Limits */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-500" />
              <span className="text-sm font-semibold">Companies Near Limits</span>
              {nearLimitCompanies.length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {nearLimitCompanies.length}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate({ to: "/admin/companies" as any })}
              className="text-xs text-blue-600 hover:underline"
            >
              View all
            </button>
          </div>
          {nearLimitCompanies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="size-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-emerald-700">All companies within limits</p>
              <p className="text-xs text-muted-foreground mt-1">No action required</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {nearLimitCompanies.slice(0, 10).map((s: any) => {
                const flags: string[] = [];
                const userPct = s.user_limit > 0 ? s.user_count / s.user_limit : 0;
                const millPct = s.mill_limit > 0 ? s.mill_count / s.mill_limit : 0;
                if (s.user_count >= s.user_limit * 0.85)
                  flags.push(`Users ${s.user_count}/${s.user_limit}`);
                if (s.mill_count >= s.mill_limit * 0.85)
                  flags.push(`Mills ${s.mill_count}/${s.mill_limit}`);
                return (
                  <NearLimitRow
                    key={s.company_id}
                    company={s}
                    flags={flags}
                    navigate={navigate}
                    userPct={userPct}
                    millPct={millPct}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Upgrade Requests */}
        <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <ShoppingCart className="size-4 text-blue-500" />
              <span className="text-sm font-semibold">Open Upgrade Requests</span>
              {pendingUpgrades.length > 0 && (
                <span className="bg-blue-100 text-blue-700 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {pendingUpgrades.length}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate({ to: "/admin/billing" })}
              className="text-xs text-blue-600 hover:underline"
            >
              Go to Billing
            </button>
          </div>
          {pendingUpgrades.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="size-8 text-emerald-400 mb-2" />
              <p className="text-sm font-medium text-emerald-700">No pending upgrade requests</p>
              <p className="text-xs text-muted-foreground mt-1">All upgrade requests reviewed</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 dark:divide-slate-800 max-h-72 overflow-y-auto">
              {pendingUpgrades.map((cr: any) => (
                <div
                  key={cr.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="size-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium capitalize">
                      {(cr.change_type ?? "upgrade").replace(/_/g, " ")} request
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {cr.reason || "No reason provided"}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate({ to: "/admin/billing" })}
                    className="shrink-0 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

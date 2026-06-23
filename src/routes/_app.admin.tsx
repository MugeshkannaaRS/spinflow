import {
  createFileRoute,
  Outlet,
  useRouterState,
  useNavigate,
  redirect,
  Link,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { fmtLakh } from "@/lib/formatters";
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
  RefreshCw,
  Building,
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

// ── Section groups for the nav grid ───────────────────────────────────────────
const SECTION_GROUPS = [
  {
    id: "companies",
    label: "Company Management",
    icon: Building2,
    accent: "#3b82f6",
    bg: "#eff6ff",
    items: [
      { id: "companies", label: "Companies", icon: Building2, desc: "Manage companies, plans & modules" },
      { id: "mills", label: "Mills", icon: Factory, desc: "View mills across all companies" },
      { id: "organizations", label: "Organizations", icon: Building, desc: "Usage overview and limits" },
      { id: "archive", label: "Archive", icon: Archive, desc: "Restore suspended companies" },
    ],
  },
  {
    id: "users",
    label: "User Management",
    icon: UserCog,
    accent: "#10b981",
    bg: "#ecfdf5",
    items: [
      { id: "users", label: "Users", icon: Users, desc: "Provision and manage users" },
      { id: "limits", label: "User Limits", icon: SlidersHorizontal, desc: "Monitor user & mill limits" },
      { id: "modules", label: "Modules", icon: Blocks, desc: "Toggle module access per company" },
      { id: "roles", label: "Role Permissions", icon: Shield, desc: "Role-module permission matrix" },
    ],
  },
  {
    id: "billing",
    label: "Billing & Revenue",
    icon: CreditCard,
    accent: "#0ea5e9",
    bg: "#f0f9ff",
    items: [
      { id: "billing", label: "Billing", icon: CreditCard, desc: "Subscriptions, invoices, plans" },
      { id: "billing/command-center", label: "Command Center", icon: BarChart3, desc: "Unified billing command center" },
      { id: "alerts", label: "Alert Center", icon: Bell, desc: "Overdue invoices & expiring subs" },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    icon: Activity,
    accent: "#8b5cf6",
    bg: "#f5f3ff",
    items: [
      { id: "alert-ops", label: "Alert Ops", icon: Bell, desc: "Alert timeline & escalation" },
      { id: "approvals", label: "Approvals", icon: CheckSquare, desc: "Approval workflow inbox" },
      { id: "incidents", label: "Incidents", icon: Flag, desc: "Incident management & resolution" },
    ],
  },
  {
    id: "platform",
    label: "Platform",
    icon: Server,
    accent: "#f43f5e",
    bg: "#fff1f2",
    items: [
      { id: "health", label: "Health Center", icon: Activity, desc: "Uptime & service monitoring" },
      { id: "backups", label: "Backup Center", icon: Database, desc: "Backup & restore policies" },
    ],
  },
  {
    id: "system",
    label: "System & Config",
    icon: SlidersHorizontal,
    accent: "#f59e0b",
    bg: "#fffbeb",
    items: [
      { id: "analytics", label: "Analytics", icon: BarChart3, desc: "Revenue, growth & adoption" },
      { id: "audit", label: "Audit Logs", icon: FileText, desc: "Full audit trail across companies" },
      { id: "column-config", label: "Column Config", icon: SlidersHorizontal, desc: "Configure table columns" },
    ],
  },
];

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  iconColor,
  iconBg,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 shadow-sm">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className={cn("w-4 h-4", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        {loading ? (
          <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        )}
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Section Nav Card ──────────────────────────────────────────────────────────
function SectionCard({
  group,
  navigate,
}: {
  group: (typeof SECTION_GROUPS)[0];
  navigate: (opts: { to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const GroupIcon = group.icon;

  return (
    <div
      className={cn(
        "bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-200",
        open ? "border-gray-200 shadow-md" : "border-gray-100 hover:border-gray-200 hover:shadow-md",
      )}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50/70 transition-colors text-left"
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: group.bg }}
        >
          <GroupIcon className="w-4 h-4" style={{ color: group.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-800">{group.label}</span>
        </div>
        <span
          className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
          style={{ backgroundColor: group.bg, color: group.accent }}
        >
          {group.items.length}
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0",
            open ? "rotate-180" : "rotate-0",
          )}
        />
      </button>

      {/* Items */}
      {open && (
        <div className="border-t border-gray-100">
          {group.items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate({ to: `/admin/${item.id}` as any })}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group",
                  idx < group.items.length - 1 && "border-b border-gray-50",
                  "hover:bg-gray-50",
                )}
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors"
                  style={{ backgroundColor: group.bg }}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: group.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">
                    {item.label}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate">{item.desc}</p>
                </div>
                <ArrowUpRight
                  className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Near Limit Row ────────────────────────────────────────────────────────────
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
  const isOver = userPct >= 1 || millPct >= 1;
  return (
    <Link
      to={`/admin/companies/${s.company_id}` as any}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
    >
      <div
        className={cn(
          "w-2 h-2 rounded-full shrink-0",
          isOver ? "bg-red-500" : "bg-amber-400",
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate group-hover:text-blue-600 transition-colors">
          {s.company_name}
        </p>
        <p className="text-[11px] text-gray-400">{flags.join(" · ")}</p>
        <div className="flex items-center gap-3 mt-1.5">
          {s.user_limit > 0 && (
            <div className="flex items-center gap-1.5 flex-1 max-w-[130px]">
              <span className="text-[10px] text-gray-400 w-5">U</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    userPct >= 1 ? "bg-red-500" : userPct >= 0.85 ? "bg-amber-400" : "bg-blue-400",
                  )}
                  style={{ width: `${Math.min(userPct * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 w-8 text-right">
                {Math.round(userPct * 100)}%
              </span>
            </div>
          )}
          {s.mill_limit > 0 && (
            <div className="flex items-center gap-1.5 flex-1 max-w-[130px]">
              <span className="text-[10px] text-gray-400 w-5">M</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                <div
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    millPct >= 1 ? "bg-red-500" : millPct >= 0.85 ? "bg-amber-400" : "bg-blue-400",
                  )}
                  style={{ width: `${Math.min(millPct * 100, 100)}%` }}
                />
              </div>
              <span className="text-[10px] text-gray-400 w-8 text-right">
                {Math.round(millPct * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>
      <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 shrink-0 transition-colors" />
    </Link>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
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
    retry: 1,
  });

  const dashboardQ = useQuery({
    queryKey: ["admin-billing-dashboard"],
    queryFn: () => api.get("/admin/billing/dashboard").then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  const analyticsQ = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 60_000,
    retry: 1,
  });

  const pendingUpgradesQ = useQuery({
    queryKey: ["admin-pending-upgrades"],
    queryFn: () =>
      api
        .get("/subscription/change-requests", { params: { status: "pending" } })
        .then((r) => r.data),
    staleTime: 30_000,
    retry: 1,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () =>
      api
        .get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } })
        .then((r) => r.data),
    staleTime: 60_000,
    retry: 1,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-red-600 font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  if (isChildRoute) return <Outlet />;

  const stats = statsQ.data;
  const dd = dashboardQ.data;
  const an = analyticsQ.data;
  const pending = pendingUpgradesQ.data;
  const subs = subsQ.data;

  const isLoading = statsQ.isLoading || dashboardQ.isLoading;
  const failedQueries = [
    dashboardQ.isError && "Dashboard",
    analyticsQ.isError && "Analytics",
    pendingUpgradesQ.isError && "Upgrade requests",
    subsQ.isError && "Subscriptions",
  ].filter(Boolean) as string[];

  const subsList: any[] = Array.isArray(subs?.items) ? subs.items : [];
  const nearLimitCompanies = subsList.filter(
    (s: any) =>
      (s.user_limit > 0 && s.user_count >= s.user_limit * 0.85) ||
      (s.mill_limit > 0 && s.mill_count >= s.mill_limit * 0.85),
  );
  const pendingUpgrades: any[] = Array.isArray(pending) ? pending : [];

  const refetchAll = () => {
    statsQ.refetch();
    dashboardQ.refetch();
    analyticsQ.refetch();
    pendingUpgradesQ.refetch();
    subsQ.refetch();
  };

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              SaaS operations, revenue &amp; company oversight
            </p>
          </div>
          <button
            onClick={refetchAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* ── Error Banner ───────────────────────────────────────────────── */}
        {failedQueries.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">
                {failedQueries.join(", ")} failed to load — data may be incomplete.
              </p>
            </div>
            <button
              onClick={refetchAll}
              className="text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── KPI Stats ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Companies"
            value={String(stats?.total_companies ?? (isLoading ? "…" : "0"))}
            sub="All tenants"
            icon={Building2}
            iconColor="text-blue-600"
            iconBg="#eff6ff"
            loading={statsQ.isLoading}
          />
          <StatCard
            label="Active"
            value={String(dd?.active_subscriptions ?? (dashboardQ.isLoading ? "…" : "—"))}
            sub="Subscriptions"
            icon={CheckCircle2}
            iconColor="text-emerald-600"
            iconBg="#ecfdf5"
            loading={dashboardQ.isLoading}
          />
          <StatCard
            label="Suspended"
            value={String(dd?.suspended_companies ?? (dashboardQ.isLoading ? "…" : "—"))}
            sub="Companies"
            icon={AlertTriangle}
            iconColor="text-red-500"
            iconBg="#fff1f2"
            loading={dashboardQ.isLoading}
          />
          <StatCard
            label="MRR"
            value={dd ? fmtLakh(dd.mrr ?? 0) : "—"}
            sub="Monthly revenue"
            icon={TrendingUp}
            iconColor="text-blue-600"
            iconBg="#eff6ff"
            loading={dashboardQ.isLoading}
          />
          <StatCard
            label="New This Month"
            value={String(dd?.new_customers_this_month ?? (dashboardQ.isLoading ? "…" : "—"))}
            sub="New customers"
            icon={UserPlus}
            iconColor="text-indigo-600"
            iconBg="#eef2ff"
            loading={dashboardQ.isLoading}
          />
          <StatCard
            label="Churn Rate"
            value={an ? `${an.churn_rate ?? 0}%` : "—"}
            sub="Overall"
            icon={DollarSign}
            iconColor="text-amber-600"
            iconBg="#fffbeb"
            loading={analyticsQ.isLoading}
          />
        </div>

        {/* ── Section Navigation ─────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Admin Sections
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {SECTION_GROUPS.map((group) => (
              <SectionCard key={group.id} group={group} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* ── Companies Near Limits + Upgrade Requests ───────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Near Limits */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-gray-800">Companies Near Limits</span>
                {nearLimitCompanies.length > 0 && (
                  <span className="bg-amber-100 text-amber-700 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                    {nearLimitCompanies.length}
                  </span>
                )}
              </div>
              <Link
                to="/admin/companies"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View all →
              </Link>
            </div>

            {subsQ.isLoading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse" />
                    <div className="flex-1">
                      <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse mb-1.5" />
                      <div className="h-2 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : nearLimitCompanies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-emerald-700">All companies within limits</p>
                <p className="text-xs text-gray-400 mt-1">No action required</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {nearLimitCompanies.slice(0, 10).map((s: any) => {
                  const flags: string[] = [];
                  const userPct = s.user_limit > 0 ? s.user_count / s.user_limit : 0;
                  const millPct = s.mill_limit > 0 ? s.mill_count / s.mill_limit : 0;
                  if (s.user_limit > 0 && s.user_count >= s.user_limit * 0.85)
                    flags.push(`Users ${s.user_count}/${s.user_limit}`);
                  if (s.mill_limit > 0 && s.mill_count >= s.mill_limit * 0.85)
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

          {/* Open Upgrade Requests */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-semibold text-gray-800">Open Upgrade Requests</span>
                {pendingUpgrades.length > 0 && (
                  <span className="bg-blue-100 text-blue-700 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                    {pendingUpgrades.length}
                  </span>
                )}
              </div>
              <Link
                to="/admin/billing"
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Go to Billing →
              </Link>
            </div>

            {pendingUpgradesQ.isLoading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <div className="h-3.5 w-36 bg-gray-100 rounded animate-pulse mb-1.5" />
                      <div className="h-2 w-24 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingUpgrades.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400 mb-2" />
                <p className="text-sm font-semibold text-emerald-700">No pending upgrade requests</p>
                <p className="text-xs text-gray-400 mt-1">All requests reviewed</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {pendingUpgrades.map((cr: any) => (
                  <div
                    key={cr.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 capitalize">
                        {(cr.change_type ?? "upgrade").replace(/_/g, " ")} request
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {cr.reason || "No reason provided"}
                      </p>
                    </div>
                    <Link
                      to="/admin/billing"
                      className="shrink-0 text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

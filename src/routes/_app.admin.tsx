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
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { cn } from "@/lib/utils";
import {
  SlidersHorizontal,
  FileText,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowUpRight,
  Activity,
  Bell,
  UserCog,
  Server,
  CheckSquare,
  Flag,
  Database,
  RefreshCw,
  ChevronDown,
  Cog,
  Package,
  TruckIcon,
  Wrench,
  ShoppingCart,
  ClipboardList,
  Zap,
  Circle,
  Clock,
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
    id: "users",
    label: "User Management",
    icon: UserCog,
    accent: "#10b981",
    bg: "#ecfdf5",
    items: [
      { id: "users", label: "Users", icon: Users, desc: "Provision and manage users" },
      { id: "roles", label: "Role Permissions", icon: Shield, desc: "Role-module permission matrix" },
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
      { id: "audit", label: "Audit Logs", icon: FileText, desc: "Full audit trail across the mill" },
      { id: "column-config", label: "Column Config", icon: SlidersHorizontal, desc: "Configure table columns" },
    ],
  },
];

// ── Module metadata ───────────────────────────────────────────────────────────
const MODULE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; iconClass: string; bg: string }> = {
  production:  { label: "Production",  icon: Cog,          iconClass: "text-blue-600",   bg: "bg-blue-50"   },
  hr:          { label: "HR",          icon: Users,        iconClass: "text-emerald-600", bg: "bg-emerald-50" },
  payroll:     { label: "Payroll",     icon: ClipboardList, iconClass: "text-violet-600", bg: "bg-violet-50" },
  quality:     { label: "Quality",     icon: CheckCircle2, iconClass: "text-amber-600",   bg: "bg-amber-50"  },
  dispatch:    { label: "Dispatch",    icon: TruckIcon,    iconClass: "text-sky-600",     bg: "bg-sky-50"    },
  maintenance: { label: "Maintenance", icon: Wrench,       iconClass: "text-red-500",     bg: "bg-red-50"    },
  purchase:    { label: "Purchase",    icon: ShoppingCart, iconClass: "text-lime-600",    bg: "bg-lime-50"   },
  inventory:   { label: "Inventory",   icon: Package,      iconClass: "text-pink-500",    bg: "bg-pink-50"   },
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, iconColor, iconBg, loading, danger, warn,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string; iconBg: string; loading?: boolean;
  danger?: boolean; warn?: boolean;
}) {
  return (
    <div className={cn(
      "bg-white rounded-xl border p-4 flex items-start gap-3 shadow-sm transition-colors",
      danger ? "border-red-200 bg-red-50" : warn ? "border-amber-200 bg-amber-50" : "border-gray-100",
    )}>
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: iconBg }}>
        <Icon className={cn("w-4 h-4", iconColor)} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        {loading ? (
          <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-1" />
        ) : (
          <p className={cn("text-2xl font-bold mt-0.5 leading-tight", danger ? "text-red-700" : warn ? "text-amber-700" : "text-gray-900")}>{value}</p>
        )}
        {sub && <p className={cn("text-[11px] mt-0.5", danger ? "text-red-500" : warn ? "text-amber-500" : "text-gray-400")}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Section Nav Card ──────────────────────────────────────────────────────────
function SectionCard({ group, navigate }: { group: (typeof SECTION_GROUPS)[0]; navigate: (o: { to: string }) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: group.bg }}>
          <group.icon className="w-3.5 h-3.5" style={{ color: group.accent }} />
        </div>
        <span className="text-sm font-semibold text-gray-800">{group.label}</span>
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ml-auto" style={{ backgroundColor: group.bg, color: group.accent }}>
          {group.items.length}
        </span>
        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0", open ? "rotate-180" : "rotate-0")} />
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {group.items.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate({ to: `/admin/${item.id}` as any })}
                className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors group hover:bg-gray-50", idx < group.items.length - 1 && "border-b border-gray-50")}
              >
                <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: group.bg }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: group.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{item.label}</p>
                  <p className="text-[11px] text-gray-400 truncate">{item.desc}</p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Module Status Badge ───────────────────────────────────────────────────────
function ModuleStatusCard({ modKey, data }: { modKey: string; data: { status: string; last_activity: string | null } }) {
  const meta = MODULE_META[modKey] ?? { label: modKey, icon: Cog, iconClass: "text-gray-500", bg: "bg-gray-50" };
  const Icon = meta.icon;

  const statusConfig = {
    active:  { dot: "bg-emerald-500", label: "Active",  text: "text-emerald-700", bg: "bg-emerald-50" },
    idle:    { dot: "bg-amber-400",   label: "Idle",    text: "text-amber-700",   bg: "bg-amber-50"   },
    no_data: { dot: "bg-gray-300",    label: "No Data", text: "text-gray-500",    bg: "bg-gray-50"    },
    unknown: { dot: "bg-gray-300",    label: "Unknown", text: "text-gray-500",    bg: "bg-gray-50"    },
  };
  const cfg = statusConfig[data.status as keyof typeof statusConfig] ?? statusConfig.unknown;

  const relativeTime = (iso: string | null) => {
    if (!iso) return "Never";
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    return "< 1h ago";
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 flex items-center gap-3">
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", meta.bg)}>
        <Icon className={cn("w-4 h-4", meta.iconClass)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
        <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3" />
          {relativeTime(data.last_activity)}
        </p>
      </div>
      <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full", cfg.bg, cfg.text)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
        {cfg.label}
      </span>
    </div>
  );
}

// ── Audit Row ─────────────────────────────────────────────────────────────────
function AuditRow({ entry }: { entry: Record<string, any> }) {
  const severityColor: Record<string, string> = {
    INFO:     "text-blue-600 bg-blue-50",
    WARNING:  "text-amber-600 bg-amber-50",
    ERROR:    "text-red-600 bg-red-50",
    CRITICAL: "text-red-800 bg-red-100",
  };
  const badge = severityColor[entry.severity] ?? severityColor.INFO;

  const relTime = (iso: string | null) => {
    if (!iso) return "";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return "just now";
  };

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
      <span className={cn("mt-0.5 shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide", badge)}>
        {entry.severity}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-800 truncate capitalize">
          {(entry.action ?? "").replace(/_/g, " ")}
          {entry.entity ? <span className="text-gray-400 font-normal"> · {entry.entity}</span> : null}
        </p>
        <p className="text-[11px] text-gray-400 truncate">{entry.details}</p>
      </div>
      <span className="shrink-0 text-[11px] text-gray-400 whitespace-nowrap">{relTime(entry.created_at)}</span>
    </div>
  );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
function AdminPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/admin";

  const healthQ = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: () => api.get("/admin/system-health").then((r) => r.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-red-600 font-medium">Only Super Admin can access this page.</div>;
  }

  if (isChildRoute) return <Outlet />;

  const h = healthQ.data;
  const loading = healthQ.isLoading;

  const machineUptime = h?.machines?.total > 0
    ? Math.round((h.machines.running / h.machines.total) * 100)
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">System Admin</h1>
            <p className="text-sm text-gray-500 mt-0.5">Live ERP health &amp; operations for this mill</p>
          </div>
          <button
            onClick={() => healthQ.refetch()}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", healthQ.isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {healthQ.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700">Could not load system health data. Check backend connectivity.</p>
          </div>
        )}

        {/* ── KPI Row ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="col-span-2 sm:col-span-2">
            <StatCard
              label="Total Users" loading={loading}
              value={loading ? "…" : String(h?.users?.total ?? 0)}
              sub={h?.users?.by_role ? `${Object.keys(h.users.by_role).length} roles` : "All roles"}
              icon={Users} iconColor="text-blue-600" iconBg="#eff6ff"
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <StatCard
              label="Machines" loading={loading}
              value={loading ? "…" : `${h?.machines?.running ?? 0}/${h?.machines?.total ?? 0}`}
              sub={machineUptime !== null ? `${machineUptime}% uptime` : "No machines"}
              icon={Cog} iconColor="text-indigo-600" iconBg="#eef2ff"
              warn={machineUptime !== null && machineUptime < 80}
              danger={machineUptime !== null && machineUptime < 60}
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <StatCard
              label="Active Alerts" loading={loading}
              value={loading ? "…" : String(h?.alerts?.active ?? 0)}
              sub={h?.alerts?.critical ? `${h.alerts.critical} critical` : "None critical"}
              icon={Bell} iconColor="text-amber-600" iconBg="#fffbeb"
              danger={(h?.alerts?.critical ?? 0) > 0}
              warn={(h?.alerts?.active ?? 0) > 0 && (h?.alerts?.critical ?? 0) === 0}
            />
          </div>
          <div className="col-span-2 sm:col-span-2">
            <StatCard
              label="Prod Entries Today" loading={loading}
              value={loading ? "…" : String(h?.production_today ?? 0)}
              sub="All departments"
              icon={Zap} iconColor="text-emerald-600" iconBg="#ecfdf5"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Open Incidents" loading={loading}
            value={loading ? "…" : String(h?.open_incidents ?? 0)}
            sub="Unresolved"
            icon={Flag} iconColor="text-red-500" iconBg="#fff1f2"
            danger={(h?.open_incidents ?? 0) > 0}
          />
          <StatCard
            label="Pending Approvals" loading={loading}
            value={loading ? "…" : String(h?.pending_approvals ?? 0)}
            sub="Awaiting action"
            icon={CheckSquare} iconColor="text-violet-600" iconBg="#f5f3ff"
            warn={(h?.pending_approvals ?? 0) > 0}
          />
          <StatCard
            label="Maintenance Open" loading={loading}
            value={loading ? "…" : String(h?.maintenance_open ?? 0)}
            sub="Work orders"
            icon={Wrench} iconColor="text-orange-500" iconBg="#fff7ed"
            warn={(h?.maintenance_open ?? 0) > 3}
          />
          <StatCard
            label="ERP Status"
            value={healthQ.isError ? "Error" : loading ? "…" : "Live"}
            sub="All services"
            icon={Activity}
            iconColor={healthQ.isError ? "text-red-500" : "text-emerald-600"}
            iconBg={healthQ.isError ? "#fff1f2" : "#ecfdf5"}
            danger={healthQ.isError}
          />
        </div>

        {/* ── Module Status + Actions Grid ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Module activity status */}
          <div className="lg:col-span-2">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Module Activity (Last 7 Days)</p>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.keys(MODULE_META).map((k) => (
                  <div key={k} className="h-16 bg-white rounded-xl border border-gray-100 animate-pulse" />
                ))}
              </div>
            ) : h?.module_status ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(h.module_status).map(([key, val]) => (
                  <ModuleStatusCard key={key} modKey={key} data={val as any} />
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 bg-white rounded-xl border border-gray-100 p-6 text-center">No module data</div>
            )}
          </div>

          {/* Quick actions */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Quick Actions</p>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden divide-y divide-gray-50">
              {[
                { to: "/admin/users",      icon: Users,       label: "Manage Users",     sub: `${h?.users?.total ?? "…"} active` },
                { to: "/admin/approvals",  icon: CheckSquare, label: "Review Approvals",  sub: `${h?.pending_approvals ?? "…"} pending`, warn: (h?.pending_approvals ?? 0) > 0 },
                { to: "/admin/incidents",  icon: Flag,        label: "Open Incidents",    sub: `${h?.open_incidents ?? "…"} open`, danger: (h?.open_incidents ?? 0) > 0 },
                { to: "/admin/alert-ops",  icon: Bell,        label: "Alert Ops",         sub: `${h?.alerts?.active ?? "…"} active`, warn: (h?.alerts?.active ?? 0) > 0 },
                { to: "/admin/health",     icon: Server,      label: "Health Center",     sub: "Service uptime" },
                { to: "/admin/audit",      icon: FileText,    label: "Audit Logs",        sub: "Full trail" },
                { to: "/admin/backups",    icon: Database,    label: "Backup Center",     sub: "Backup & restore" },
                { to: "/admin/column-config", icon: SlidersHorizontal, label: "Column Config", sub: "Table customization" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to as any}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", (item as any).danger ? "text-red-500" : (item as any).warn ? "text-amber-500" : "text-gray-400 group-hover:text-gray-600")} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700 group-hover:text-gray-900">{item.label}</p>
                      <p className={cn("text-[11px]", (item as any).danger ? "text-red-500" : (item as any).warn ? "text-amber-500" : "text-gray-400")}>{item.sub}</p>
                    </div>
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 shrink-0" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Admin Sections ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Admin Sections</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {SECTION_GROUPS.map((group) => (
              <SectionCard key={group.id} group={group} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* ── Recent Audit Log ─────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest">Recent Audit Events</p>
            <Link to="/admin/audit" className="text-xs text-blue-600 hover:text-blue-800 font-medium">View all →</Link>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-4 py-3 flex items-center gap-3">
                    <div className="h-5 w-12 bg-gray-100 rounded animate-pulse shrink-0" />
                    <div className="flex-1">
                      <div className="h-3.5 w-48 bg-gray-100 rounded animate-pulse mb-1.5" />
                      <div className="h-2.5 w-32 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : h?.recent_audit?.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {h.recent_audit.map((entry: any, i: number) => (
                  <AuditRow key={i} entry={entry} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <FileText className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No audit events yet</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

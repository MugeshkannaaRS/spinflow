import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Factory,
  Gauge,
  Users,
  Cpu,
  TrendingUp,
  AlertTriangle,
  Package,
  Truck,
  CreditCard,
  Wrench,
} from "lucide-react";
import { fmt, fmtCurrency, fmtDate } from "@/lib/formatters";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SpinFlow ERP" }] }),
  component: DashboardPage,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function greet() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function fmtAxisDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch {
    return d;
  }
}

// ─── Dashboard skeleton ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="h-8 bg-[#e2e8f0] rounded w-64" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-[#e2e8f0] rounded-lg p-5 h-28">
            <Skeleton className="h-3 w-24 mb-3" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-lg h-64">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="lg:col-span-2 bg-white border border-[#e2e8f0] rounded-lg h-64">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ─── Main dashboard page ──────────────────────────────────────────────────────

function DashboardPage() {
  const { user } = useAuth();
  const { millId, millName } = useActiveMill();
  const role = user?.role ?? "";
  const isSuperAdmin = role === "SUPER_ADMIN";

  // SUPER_ADMIN → admin summary (vendor KPIs)
  const adminQ = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () =>
      // Try new rich endpoint first, fallback to legacy
      api
        .get("/admin/dashboard")
        .then((r) => r.data)
        .catch(() => api.get("/dashboard/admin-summary").then((r) => r.data)),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    enabled: isSuperAdmin,
  });

  // Mill dashboard summary — for everyone incl. super admin (single-mill system;
  // the backend resolves the one mill from scope when no mill_id is passed).
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-summary", millId ?? "single"],
    queryFn: () =>
      api.get("/dashboard/summary", { params: millId ? { mill_id: millId } : {} }).then((r) => r.data),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 2,
  });

  // ── SUPER_ADMIN: single-mill administration overview ───────────────────
  if (isSuperAdmin) {
    const ad = adminQ.data ?? {};
    const d: any = data ?? {};
    const totalUsers = ad.total_users ?? d.users?.total ?? 0;
    const machineTotal = d.machines?.total ?? d.machines?.count ?? 0;
    const machineRunning = d.machines?.running ?? d.machines?.active ?? null;
    const openAlerts = d.alerts?.open ?? ad.open_alerts ?? 0;

    const adminLinks = [
      { to: "/admin/users", label: "Users", desc: "Add & manage users", icon: Users },
      { to: "/admin/roles", label: "Role Permissions", desc: "Module access per role", icon: AlertTriangle },
      { to: "/admin/health", label: "System Health", desc: "DB, services, status", icon: Gauge },
      { to: "/admin/backups", label: "Backups", desc: "Backup & restore", icon: Package },
      { to: "/admin/audit", label: "Audit Logs", desc: "Activity trail", icon: TrendingUp },
      { to: "/admin/column-config", label: "Column Config", desc: "Table columns", icon: Cpu },
    ];

    return (
      <div className="flex flex-col min-h-full bg-[#f8fafc]">
        <PageHeader
          title={`${greet()}, ${user?.name ?? "Admin"}`}
          subtitle={`Single-mill administration · ${millName}`}
          onRefresh={() => { adminQ.refetch(); refetch(); }}
          isRefreshing={adminQ.isFetching || isFetching}
        />
        <div className="p-6 space-y-6">
          {/* Single-mill KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Users" value={fmt(totalUsers)} icon={Users} iconColor="text-green-600" iconBg="bg-green-50" />
            <KpiCard
              label="Machines"
              value={machineRunning != null ? `${fmt(machineRunning)}/${fmt(machineTotal)}` : fmt(machineTotal)}
              icon={Cpu} iconColor="text-blue-600" iconBg="bg-blue-50"
            />
            <KpiCard label="Departments" value={fmt(d.departments?.total ?? d.departments ?? 0)} icon={Factory} iconColor="text-cyan-600" iconBg="bg-cyan-50" />
            <KpiCard
              label="Open Alerts"
              value={fmt(openAlerts)}
              icon={AlertTriangle}
              iconColor={openAlerts > 0 ? "text-red-600" : "text-slate-400"}
              iconBg={openAlerts > 0 ? "bg-red-50" : "bg-slate-50"}
            />
          </div>

          {/* System Administration quick-links */}
          <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0]">
              <h3 className="text-sm font-semibold text-[#0f172a]">System Administration</h3>
              <p className="text-xs text-[#64748b] mt-0.5">Manage users, roles, and system settings for {millName}.</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
              {adminLinks.map((l) => (
                <Link key={l.to} to={l.to} className="flex items-start gap-3 rounded-lg border border-[#e2e8f0] p-3 hover:bg-[#f8fafc] transition-colors">
                  <div className="rounded-md bg-blue-50 text-blue-600 p-2"><l.icon className="size-4" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[#0f172a]">{l.label}</div>
                    <div className="text-xs text-[#64748b] truncate">{l.desc}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Operational shortcut */}
          <div className="bg-white border border-[#e2e8f0] rounded-lg px-5 py-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#0f172a]">Mill Operations</h3>
              <p className="text-xs text-[#64748b] mt-0.5">Production, quality, maintenance and more — use the module tabs in the sidebar.</p>
            </div>
            <Link to="/maintenance" className="text-xs text-blue-600 hover:underline whitespace-nowrap">Maintenance →</Link>
          </div>
        </div>
      </div>
    );
  }

  // Convenience: check if a top-level section key exists in the response
  const has = (...keys: string[]) =>
    keys.some((k) => data?.[k] !== undefined && data?.[k] !== null);

  if (isLoading) return <DashboardSkeleton />;

  const prod = data?.production;
  const att = data?.attendance;
  const mach = data?.machines;
  const fin = data?.finance;
  const inv = data?.inventory;
  const dis = data?.dispatch;
  const qual = data?.quality;

  const isDashboardOnly = ["MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR"].includes(role);

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc]">
      <PageHeader
        title={`${greet()}, ${user?.name ?? "User"}`}
        subtitle={`${data?.mill_name ?? millName ?? ""} · Live operations overview · Last updated ${data?.as_of ? fmtDate(data.as_of) : "now"}`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-6">
        {/* ── Dashboard-only role: simple welcome card ────────────────────── */}
        {isDashboardOnly && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-10 text-center">
            <div className="text-5xl mb-4">👋</div>
            <h2 className="text-2xl font-semibold text-[#0f172a]">
              {greet()}, {user?.name}
            </h2>
            <p className="text-[#64748b] mt-2">
              {millName} · {role.replace(/_/g, " ")}
            </p>
            {data?.schedule && (
              <div className="mt-5 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-5 py-2.5 rounded-full text-sm font-semibold">
                <Cpu className="w-4 h-4" />
                Current shift: {data.schedule.current_shift} · {data.schedule.shift_start}–
                {data.schedule.shift_end}
              </div>
            )}
          </div>
        )}

        {/* ── KPI cards row ────────────────────────────────────────────────── */}
        {!isDashboardOnly && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {has("production") && (
              <KpiCard
                label="Today's Production"
                value={`${fmt(prod?.today_output_kg ?? 0)} kg`}
                subLabel={`Target: ${fmt(prod?.today_target_kg ?? 0)} kg`}
                icon={Factory}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
                progress={
                  (prod?.today_target_kg ?? 0) > 0
                    ? { value: prod!.today_output_kg, max: prod!.today_target_kg }
                    : undefined
                }
              />
            )}

            {has("production") && (
              <KpiCard
                label="Waste %"
                value={`${(prod?.waste_pct ?? 0).toFixed(1)}%`}
                subLabel="Target: < 4.0%"
                icon={Gauge}
                iconColor={(prod?.waste_pct ?? 0) > 4 ? "text-red-600" : "text-green-600"}
                iconBg={(prod?.waste_pct ?? 0) > 4 ? "bg-red-50" : "bg-green-50"}
              />
            )}

            {has("attendance") && (
              <KpiCard
                label="Attendance"
                value={`${att?.today_present ?? 0} / ${att?.today_total ?? 0}`}
                subLabel={`${(att?.present_pct ?? 0).toFixed(0)}% present · ${att?.today_absent ?? 0} absent`}
                icon={Users}
                iconColor="text-cyan-600"
                iconBg="bg-cyan-50"
                progress={
                  (att?.today_total ?? 0) > 0
                    ? {
                        value: att!.today_present,
                        max: att!.today_total,
                        color: (att?.present_pct ?? 0) < 80 ? "#dc2626" : "#16a34a",
                      }
                    : undefined
                }
              />
            )}

            {has("machines") && (
              <KpiCard
                label="Active Machines"
                value={`${mach?.active ?? 0} / ${mach?.total ?? 0}`}
                subLabel={`${mach?.down ?? 0} down · ${mach?.maintenance ?? 0} in maintenance`}
                icon={Cpu}
                iconColor="text-green-600"
                iconBg="bg-green-50"
              />
            )}

            {has("finance") && (
              <KpiCard
                label="Monthly Revenue"
                value={fmtCurrency(fin?.monthly_revenue ?? 0)}
                subLabel={`Purchases: ${fmtCurrency(fin?.monthly_purchases ?? 0)}`}
                icon={TrendingUp}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
              />
            )}

            {has("finance") && (
              <KpiCard
                label="Outstanding"
                value={fmtCurrency(fin?.outstanding ?? 0)}
                subLabel={`${fin?.overdue_count ?? 0} customers overdue`}
                icon={CreditCard}
                iconColor={(fin?.overdue_count ?? 0) > 0 ? "text-red-600" : "text-slate-600"}
                iconBg={(fin?.overdue_count ?? 0) > 0 ? "bg-red-50" : "bg-slate-50"}
              />
            )}

            {has("inventory") && (inv?.low_stock_count ?? 0) > 0 && (
              <KpiCard
                label="Low Stock Items"
                value={String(inv?.low_stock_count ?? 0)}
                subLabel="Items below reorder level"
                icon={Package}
                iconColor="text-amber-600"
                iconBg="bg-amber-50"
              />
            )}

            {has("dispatch") && (
              <KpiCard
                label="Today's Trips"
                value={String(dis?.today_trips ?? 0)}
                subLabel={`${dis?.pending_deliveries ?? 0} in transit · ${dis?.delivered_today ?? 0} delivered`}
                icon={Truck}
                iconColor="text-indigo-600"
                iconBg="bg-indigo-50"
              />
            )}

            {has("quality") && (
              <KpiCard
                label="Quality Pass Rate"
                value={`${(qual?.pass_rate_pct ?? 0).toFixed(1)}%`}
                subLabel={`${qual?.tests_today ?? 0} tests today · ${qual?.pending_approvals ?? 0} pending`}
                icon={Wrench}
                iconColor={(qual?.pass_rate_pct ?? 0) >= 90 ? "text-green-600" : "text-amber-600"}
                iconBg={(qual?.pass_rate_pct ?? 0) >= 90 ? "bg-green-50" : "bg-amber-50"}
                progress={
                  (qual?.tests_today ?? 0) > 0
                    ? { value: qual!.pass_rate_pct, max: 100 }
                    : undefined
                }
              />
            )}
          </div>
        )}

        {/* ── Charts row: Production trend + Dept attendance ───────────────── */}
        {!isDashboardOnly && has("production") && (prod?.last_7_days?.length ?? 0) > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Production trend */}
            <div className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-lg p-5">
              <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
                Production vs Target — Last 7 Days
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={prod!.last_7_days}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    tickFormatter={fmtAxisDate}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${fmt(v)} kg`]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    dataKey="output_kg"
                    stroke="#3b82f6"
                    name="Actual"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    dataKey="target_kg"
                    stroke="#94a3b8"
                    name="Target"
                    strokeDasharray="4 2"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Dept attendance */}
            {has("attendance") && (att?.by_department?.length ?? 0) > 0 && (
              <div className="lg:col-span-2 bg-white border border-[#e2e8f0] rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
                  Department Attendance Today
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={att!.by_department} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      dataKey="department"
                      type="category"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      width={80}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="present" fill="#3b82f6" name="Present" stackId="a" />
                    <Bar dataKey="absent" fill="#fca5a5" name="Absent" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── Finance revenue trend ─────────────────────────────────────────── */}
        {!isDashboardOnly && has("finance") && (fin?.revenue_trend?.length ?? 0) > 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
              Revenue &amp; Purchases — Last 6 Months
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={fin!.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [fmtCurrency(v)]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.12}
                  name="Revenue"
                  strokeWidth={2}
                />
                <Area
                  dataKey="purchases"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.12}
                  name="Purchases"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Low stock table ───────────────────────────────────────────────── */}
        {!isDashboardOnly && has("inventory") && (inv?.low_stock_items?.length ?? 0) > 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg">
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center gap-2">
              <Package className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-[#0f172a]">Low Stock Alert</h3>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0]">
                  <th className="text-left px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide">
                    Item
                  </th>
                  <th className="text-right px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide">
                    Current
                  </th>
                  <th className="text-right px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide">
                    Reorder Level
                  </th>
                  <th className="text-left px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide">
                    Unit
                  </th>
                </tr>
              </thead>
              <tbody>
                {inv!.low_stock_items.map((item: any, i: number) => (
                  <tr
                    key={i}
                    className="border-t border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors"
                  >
                    <td className="px-4 py-3 text-[#0f172a]">{item.name}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-600 font-semibold">
                      {fmt(item.current)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#64748b]">
                      {fmt(item.reorder_level)}
                    </td>
                    <td className="px-4 py-3 text-[#64748b]">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* ── Bottom row: Alerts + Pending Actions + Schedule ──────────────── */}
        {!isDashboardOnly && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Live Alerts */}
            <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-[#0f172a]">Live Alerts</h3>
                {(data?.alerts?.length ?? 0) > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {data.alerts.length}
                  </span>
                )}
              </div>
              {(data?.alerts?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  {data.alerts.map((a: any, i: number) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
                        a.type === "error"
                          ? "bg-red-50 text-red-700"
                          : a.type === "warning"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{a.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-green-600 py-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                  All systems normal
                </div>
              )}
            </div>

            {/* Pending Actions */}
            {has("pending_actions") && (data?.pending_actions?.length ?? 0) > 0 && (
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-3">Pending Actions</h3>
                <div className="space-y-1">
                  {data.pending_actions.map((a: any, i: number) => (
                    <a
                      key={i}
                      href={a.route}
                      className="flex justify-between items-center p-2.5 rounded-lg hover:bg-[#f8fafc] text-sm text-[#374151] group transition-colors"
                    >
                      <span className="group-hover:text-[#3b82f6] transition-colors">
                        {a.label}
                      </span>
                      <span className="bg-[#f1f5f9] text-[#475569] text-xs px-2 py-0.5 rounded-full font-mono font-semibold ml-2">
                        {a.count}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Today's Schedule */}
            {has("schedule") && data?.schedule && (
              <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
                <h3 className="text-sm font-semibold text-[#0f172a] mb-3">Today's Schedule</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    <span className="font-semibold text-[#0f172a]">
                      Shift {data.schedule.current_shift} — Active
                    </span>
                  </div>
                  <div className="font-mono text-[#64748b] text-base">
                    {data.schedule.shift_start} – {data.schedule.shift_end}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

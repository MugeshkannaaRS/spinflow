import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { KpiCard } from "@/components/ui/KpiCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  BarChart,
  Bar,
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
  Cpu,
  Users,
  Package,
  Truck,
  Bell,
  Building2,
  TrendingUp,
} from "lucide-react";
import { fmt } from "@/lib/formatters";
export const Route = createFileRoute("/_app/dashboard/owner")({
  head: () => ({ meta: [{ title: "Group Dashboard — SpinFlow ERP" }] }),
  component: OwnerDashboardPage,
});

function OwnerSkeleton() {
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-[#e2e8f0] rounded-lg h-48">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
        <div className="bg-white border border-[#e2e8f0] rounded-lg h-48">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function OwnerDashboardPage() {
  const { user } = useAuth();
  const isMillOwner = user?.role === "MILL_OWNER";

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["owner-dashboard"],
    queryFn: () => api.get("/dashboard/owner-summary").then((r) => r.data),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: isMillOwner,
  });

  if (isLoading) return <OwnerSkeleton />;

  const mills = data?.mills ?? [];
  const hasMills = mills.length > 0;

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc]">
      <PageHeader
        title={`Group Dashboard`}
        subtitle={`${mills.length} mill(s) · Consolidated view across all units`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      <div className="p-6 space-y-6">

        {/* ── Company-wide KPI cards ─────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Total Production (Today)"
            value={`${fmt(data?.total_production_kg_today ?? 0)} kg`}
            icon={Factory}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <KpiCard
            label="Avg Efficiency"
            value={`${(data?.avg_efficiency_pct ?? 0).toFixed(1)}%`}
            icon={Gauge}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
          <KpiCard
            label="Active Machines"
            value={`${data?.total_active_machines ?? 0} / ${data?.total_machines ?? 0}`}
            icon={Cpu}
            iconColor="text-cyan-600"
            iconBg="bg-cyan-50"
          />
          <KpiCard
            label="Employees / Present"
            value={`${data?.total_present_today ?? 0} / ${data?.total_employees ?? 0}`}
            icon={Users}
            iconColor="text-purple-600"
            iconBg="bg-purple-50"
          />
          <KpiCard
            label="Stock on Hand"
            value={`${fmt(data?.total_balance_kg ?? 0)} kg`}
            icon={Package}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <KpiCard
            label="Dispatch (Today)"
            value={`${fmt(data?.total_dispatch_kg_today ?? 0)} kg`}
            icon={Truck}
            iconColor="text-indigo-600"
            iconBg="bg-indigo-50"
          />
          <KpiCard
            label="Open Alerts"
            value={String(data?.total_open_alerts ?? 0)}
            icon={Bell}
            iconColor={(data?.total_open_alerts ?? 0) > 0 ? "text-red-600" : "text-slate-400"}
            iconBg={(data?.total_open_alerts ?? 0) > 0 ? "bg-red-50" : "bg-slate-50"}
          />
          <KpiCard
            label="Active Mills"
            value={String(mills.length)}
            icon={Building2}
            iconColor="text-teal-600"
            iconBg="bg-teal-50"
          />
        </div>

        {/* ── Per-Mill Breakdown ──────────────────────────────────────── */}
        {hasMills && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {mills.map((mill: any) => (
              <div
                key={mill.mill_id}
                className="bg-white border border-[#e2e8f0] rounded-lg p-5"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#0f172a]">
                      {mill.mill_name}
                    </h3>
                    <p className="text-[11px] text-[#94a3b8] font-mono">{mill.mill_code}</p>
                  </div>
                  <Link
                    to="/dashboard"
                    search={{ mill_id: mill.mill_id }}
                    className="text-[11px] text-blue-600 hover:underline"
                  >
                    View Mill →
                  </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Production</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {fmt(mill.production_kg_today)} kg
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Efficiency</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {mill.efficiency_pct.toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Machines</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {mill.active_machines} / {mill.total_machines}
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Employees</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {mill.present_today} / {mill.employees_active}
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Stock</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {fmt(mill.balance_kg)} kg
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3">
                    <p className="text-[11px] text-[#94a3b8]">Dispatch</p>
                    <p className="text-sm font-semibold text-[#0f172a] mt-1">
                      {fmt(mill.dispatch_kg_today)} kg
                    </p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-lg p-3 col-span-2 sm:col-span-3 flex items-center gap-2">
                    <Bell className="w-3.5 h-3.5 text-[#94a3b8]" />
                    <span className="text-[11px] text-[#64748b]">
                      {mill.open_alerts > 0
                        ? `${mill.open_alerts} open alert(s)`
                        : "No open alerts"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Production comparison chart ──────────────────────────────── */}
        {hasMills && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
              Production by Mill — Today
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={mills.map((m: any) => ({
                  name: m.mill_code,
                  production: m.production_kg_today,
                  efficiency: m.efficiency_pct,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
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
                <Bar dataKey="production" fill="#3b82f6" name="Production (kg)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Efficiency comparison chart ──────────────────────────────── */}
        {hasMills && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#0f172a] mb-4">
              Efficiency by Mill — Today
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart
                data={mills.map((m: any) => ({
                  name: m.mill_code,
                  efficiency: m.efficiency_pct,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="efficiency"
                  fill="#10b981"
                  name="Efficiency (%)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!hasMills && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-10 text-center">
            <Building2 className="w-10 h-10 text-[#94a3b8] mx-auto mb-3" />
            <h3 className="text-base font-semibold text-[#0f172a]">No Mills Found</h3>
            <p className="text-sm text-[#64748b] mt-1">
              Your company has no active mills. Set up a mill to see consolidated data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

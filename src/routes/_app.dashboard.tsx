import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { StatCard } from "@/components/ui/StatCard";
import { useRBAC } from "@/hooks/useRBAC";
import { SuperAdminDashboard } from "@/components/dashboard/SuperAdminDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, X, RefreshCw,
  Factory, Trash2, Users, Cpu, IndianRupee, AlertCircle,
  CheckCircle2, Circle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SpinFlow ERP" }] }),
  component: Dashboard,
});

const productionData = [
  { day: "Mon", produced: 4280, target: 5000 },
  { day: "Tue", produced: 4510, target: 5000 },
  { day: "Wed", produced: 4720, target: 5000 },
  { day: "Thu", produced: 4380, target: 5000 },
  { day: "Fri", produced: 4950, target: 5000 },
  { day: "Sat", produced: 4620, target: 5000 },
  { day: "Sun", produced: 4100, target: 5000 },
];

const deptAttendance = [
  { dept: "Production", pct: 94, color: "#10b981" },
  { dept: "Maintenance", pct: 88, color: "#f59e0b" },
  { dept: "Admin", pct: 96, color: "#10b981" },
  { dept: "Electrical", pct: 92, color: "#10b981" },
  { dept: "Quality", pct: 90, color: "#10b981" },
  { dept: "Store", pct: 85, color: "#f59e0b" },
  { dept: "Civil", pct: 78, color: "#ef4444" },
];

const liveAlerts = [
  { severity: "critical" as const, message: "Ring Frame #12 stopped — 2hrs 15min", time: "15 min ago" },
  { severity: "critical" as const, message: "Cotton stock: 3.2 days remaining", time: "1 hr ago" },
  { severity: "warning" as const, message: "ABC Mills Pvt Ltd — ₹4.2L overdue (45 days)", time: "3 hrs ago" },
  { severity: "warning" as const, message: "LC #2024-089 expires in 5 days — ₹18L", time: "5 hrs ago" },
  { severity: "warning" as const, message: "Ring Frame section — 8 absent today", time: "8 hrs ago" },
];

const pendingActions = [
  { label: "Quality tests pending approval", count: 12 },
  { label: "Dispatch trips to confirm", count: 5 },
  { label: "Leave requests pending", count: 3 },
  { label: "LC expiring this week", count: 2 },
];

function Dashboard() {
  const { isSuperAdmin } = useRBAC();
  const user = useAuth((s) => s.user);
  const { millId, millName } = useActiveMill();
  const navigate = useNavigate();
  const [alertDismissed, setAlertDismissed] = useState(false);

  const { data: summary, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dashboard-summary", millId],
    queryFn: () => api.get("/dashboard/summary", { params: { mill_id: millId } }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!millId,
  });

  if (isSuperAdmin) return <SuperAdminDashboard />;

  const hasCriticalAlerts = !alertDismissed;
  const raw = summary ?? {};

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  }

  const demoData = {
    productionToday: Number(raw.production_today ?? 4280),
    productionTarget: Number(raw.production_target ?? 5000),
    wastePercent: Number(raw.waste_percent ?? 3.8),
    attendancePresent: Number(raw.attendance_present ?? 387),
    attendanceTotal: Number(raw.attendance_total ?? 422),
    attendanceAbsent: Number(raw.attendance_absent ?? 35),
    activeMachines: Number(raw.active_machines ?? 47),
    totalMachines: Number(raw.total_machines ?? 52),
    monthlyRevenue: Number(raw.monthly_revenue ?? 3840000),
    revenueTarget: Number(raw.revenue_target ?? 4500000),
    pendingPayments: Number(raw.pending_payments ?? 1280000),
    overdueCustomers: Number(raw.overdue_customers ?? 4),
  };

  const pct = demoData.productionTarget > 0
    ? (demoData.productionToday / demoData.productionTarget) * 100
    : 0;

  return (
    <>
      <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Good {getGreeting()}, {user?.name?.split(" ")[0] ?? "User"}
            </h1>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">{millName} · Live operations overview</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isFetching && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
        {hasCriticalAlerts && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-red-700 dark:text-red-300">
              <strong>Action Required:</strong> Machine #12 down · Cotton stock critical · 2 payments overdue
            </span>
            <button onClick={() => setAlertDismissed(true)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-28 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard
              title="Today's Production"
              value={`${demoData.productionToday.toLocaleString()} kg`}
              subtitle={`Target: ${demoData.productionTarget.toLocaleString()} kg`}
              progress={pct}
              trend="+3.2% vs yesterday"
              trendUp
              icon={Factory}
              color="blue"
            />
            <StatCard
              title="Waste %"
              value={`${demoData.wastePercent.toFixed(1)}%`}
              subtitle="Target: < 4.0%"
              trend="-0.3% vs yesterday"
              trendUp
              icon={Trash2}
              color="green"
            />
            <StatCard
              title="Attendance"
              value={`${demoData.attendancePresent} / ${demoData.attendanceTotal}`}
              subtitle={`${((demoData.attendancePresent / demoData.attendanceTotal) * 100).toFixed(1)}% present · ${demoData.attendanceAbsent} absent`}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Active Machines"
              value={`${demoData.activeMachines} / ${demoData.totalMachines}`}
              subtitle={`${demoData.totalMachines - demoData.activeMachines} machines down`}
              alert={demoData.totalMachines - demoData.activeMachines > 0}
              icon={Cpu}
              color="orange"
            />
            <StatCard
              title="Monthly Revenue"
              value={`₹${(demoData.monthlyRevenue / 100000).toFixed(1)}L`}
              progress={(demoData.monthlyRevenue / demoData.revenueTarget) * 100}
              progressLabel={`₹${(demoData.monthlyRevenue / 100000).toFixed(1)}L of ₹${(demoData.revenueTarget / 100000).toFixed(1)}L target`}
              icon={IndianRupee}
              color="emerald"
            />
            <StatCard
              title="Pending Payments"
              value={`₹${(demoData.pendingPayments / 100000).toFixed(1)}L`}
              subtitle={`${demoData.overdueCustomers} customers overdue`}
              alert={demoData.overdueCustomers > 0}
              icon={AlertCircle}
              color="red"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Production vs Target — Last 7 Days</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionData} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.07)",
                    }}
                  />
                  <ReferenceLine y={5000} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: "Target", position: "right", fontSize: 11, fill: "#3b82f6" }} />
                  <Bar dataKey="produced" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Produced (kg)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Department Attendance Today</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptAttendance} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: "#9ca3af" }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Attendance"]}
                    contentStyle={{
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 12,
                      boxShadow: "0 4px 6px rgba(0,0,0,0.07)",
                    }}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {deptAttendance.map((entry, idx) => (
                      <Cell key={idx} fill={entry.pct >= 90 ? "#10b981" : entry.pct >= 80 ? "#f59e0b" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Live Alerts</h3>
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                {liveAlerts.length}
              </span>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {liveAlerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    alert.severity === "critical" ? "bg-red-500" : "bg-yellow-500",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 dark:text-slate-300 truncate">{alert.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/audit" className="block text-xs font-medium text-center py-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors border-t border-gray-50 dark:border-slate-700/50">
              View all alerts
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Pending Actions</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {pendingActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => navigate({ to: "/audit" })}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <span className="text-sm text-gray-600 dark:text-slate-400">{action.label}</span>
                  <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded-full">{action.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Today's Schedule</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              <div className="flex items-center gap-3 px-5 py-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 dark:text-slate-300">A Shift started 6:00 AM</p>
                  <p className="text-xs text-gray-400">6:00 AM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3">
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 dark:text-slate-300">B Shift starts 2:00 PM</p>
                  <p className="text-xs text-gray-400">2:00 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3">
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 dark:text-slate-300">C Shift starts 10:00 PM</p>
                  <p className="text-xs text-gray-400">10:00 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3">
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 dark:text-slate-300">Cotton delivery expected</p>
                  <p className="text-xs text-gray-400">Today</p>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3">
                <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                <div>
                  <p className="text-sm text-gray-700 dark:text-slate-300">5 dispatches scheduled today</p>
                  <p className="text-xs text-gray-400">All day</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

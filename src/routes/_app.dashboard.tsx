import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Topbar } from "@/components/layout/Topbar";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, X,
  Factory, Trash2, Users, Cpu, IndianRupee, AlertCircle,
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
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [alertDismissed, setAlertDismissed] = useState(false);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get("/dashboard/summary").then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const hasCriticalAlerts = !alertDismissed;
  const raw = summary ?? {};

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
      <Topbar title={`Good day, ${user?.name?.split(" ")[0] ?? "User"}`} subtitle="Live operations overview" />

      <div className="space-y-4">
        {hasCriticalAlerts && (
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-red-500 shrink-0" />
              <span className="font-semibold text-red-700 dark:text-red-300">Action Required:</span>
              <span className="text-red-600 dark:text-red-400">Machine #12 down · Cotton stock critical · 2 payments overdue</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link to="/audit" className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline">View All</Link>
              <button onClick={() => setAlertDismissed(true)} className="text-red-400 hover:text-red-600">
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-28 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
              color="indigo"
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
          <div className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Production vs Target — Last 7 Days</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} />
                  <YAxis stroke="var(--text-muted)" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="target" fill="var(--bg-tertiary)" radius={[4, 4, 0, 0]} name="Target" />
                  <Bar dataKey="produced" fill="var(--brand-500)" radius={[4, 4, 0, 0]} name="Produced" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Department Attendance Today</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptAttendance} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--text-muted)" fontSize={12} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="dept" stroke="var(--text-muted)" fontSize={11} width={80} />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Attendance"]}
                    contentStyle={{
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {deptAttendance.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Alerts</h3>
              <Badge variant="destructive" className="text-[10px] h-5">{liveAlerts.length}</Badge>
            </div>
            <div className="space-y-0">
              {liveAlerts.map((alert, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
                  <span className={cn(
                    "size-2 rounded-full shrink-0",
                    alert.severity === "critical" ? "bg-red-500" : "bg-yellow-500",
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--text-primary)] truncate">{alert.message}</p>
                    <p className="text-[10px] text-[var(--text-muted)]">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link to="/audit" className="block text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] mt-3 text-center">
              View all alerts
            </Link>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Pending Actions</h3>
            <div className="space-y-2">
              {pendingActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => navigate({ to: "/audit" })}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left"
                >
                  <span className="text-xs text-[var(--text-primary)]">{action.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-5 shrink-0 ml-2">{action.count}</Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[var(--bg-primary)] rounded-xl p-5 shadow-[var(--card-shadow)]">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Today's Schedule</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-emerald-500">✅</span>
                <span className="text-[var(--text-primary)]">A Shift started 6:00 AM</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-amber-500">🕐</span>
                <span className="text-[var(--text-primary)]">B Shift starts 2:00 PM</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-amber-500">🕐</span>
                <span className="text-[var(--text-primary)]">C Shift starts 10:00 PM</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-blue-500">📦</span>
                <span className="text-[var(--text-primary)]">Cotton delivery expected</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-purple-500">🚛</span>
                <span className="text-[var(--text-primary)]">5 dispatches scheduled today</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

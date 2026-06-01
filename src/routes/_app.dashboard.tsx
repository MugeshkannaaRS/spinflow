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

  const raw = summary ?? {};

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  }

  const prodToday = Number(raw.production_today ?? 0);
  const prodTarget = Number(raw.production_target ?? 1);
  const wastePct = Number(raw.waste_percent ?? 0);
  const attPresent = Number(raw.attendance_present ?? 0);
  const attTotal = Number(raw.attendance_total ?? 0);
  const attAbsent = Number(raw.attendance_absent ?? 0);
  const activeMach = Number(raw.active_machines ?? 0);
  const totalMach = Number(raw.total_machines ?? 0);
  const monthlyRev = Number(raw.monthly_revenue ?? 0);
  const revTarget = Number(raw.revenue_target ?? 1);
  const pendingPay = Number(raw.pending_payments ?? 0);
  const overdueCust = Number(raw.overdue_customers ?? 0);

  const pct = prodTarget > 0 ? (prodToday / prodTarget) * 100 : 0;

  const productionTrend: { day: string; produced: number; target: number }[] = raw.production_trend ?? [];
  const deptAttendance: { dept: string; pct: number }[] = raw.dept_attendance ?? [];
  const alerts: { type: string; message: string; time: string }[] = raw.alerts ?? [];
  const pendingActions: { label: string; count: number }[] = raw.pending_actions ?? [];
  const scheduleData: { label: string; time: string; done: boolean }[] = raw.schedule ?? [];

  const hasCriticalAlerts = !alertDismissed && alerts.length > 0;

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
              <strong>Action Required:</strong> {alerts.filter(a => a.type === "critical").length} critical alert(s)
            </span>
            <button onClick={() => setAlertDismissed(true)} className="ml-auto text-red-400 hover:text-red-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-7 w-28 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
            <StatCard
              title="Today's Production"
              value={`${prodToday.toLocaleString()} kg`}
              subtitle={`Target: ${prodTarget.toLocaleString()} kg`}
              progress={pct}
              icon={Factory}
              color="blue"
            />
            <StatCard
              title="Waste %"
              value={`${wastePct.toFixed(1)}%`}
              subtitle="Target: < 4.0%"
              icon={Trash2}
              color="green"
            />
            <StatCard
              title="Attendance"
              value={`${attPresent} / ${attTotal}`}
              subtitle={`${attTotal > 0 ? ((attPresent / attTotal) * 100).toFixed(1) : 0}% present · ${attAbsent} absent`}
              icon={Users}
              color="blue"
            />
            <StatCard
              title="Active Machines"
              value={`${activeMach} / ${totalMach}`}
              subtitle={`${totalMach - activeMach} machines down`}
              alert={totalMach - activeMach > 0}
              icon={Cpu}
              color="orange"
            />
            <StatCard
              title="Monthly Revenue"
              value={`₹${(monthlyRev / 100000).toFixed(1)}L`}
              progress={revTarget > 0 ? (monthlyRev / revTarget) * 100 : 0}
              progressLabel={`₹${(monthlyRev / 100000).toFixed(1)}L of ₹${(revTarget / 100000).toFixed(1)}L target`}
              icon={IndianRupee}
              color="emerald"
            />
            <StatCard
              title="Pending Payments"
              value={`₹${(pendingPay / 100000).toFixed(1)}L`}
              subtitle={`${overdueCust} customers overdue`}
              alert={overdueCust > 0}
              icon={AlertCircle}
              color="red"
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Production vs Target — Last 7 Days</h3>
            <div className="h-64">
              {productionTrend.some(d => d.produced > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={productionTrend} barSize={28}>
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
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500 text-sm">
                  <div className="text-center">
                    <Factory className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                    <p>No production data yet</p>
                    <p className="text-xs mt-1">Start recording production entries to see trends</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Department Attendance Today</h3>
            <div className="h-64">
              {deptAttendance.length > 0 ? (
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
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500 text-sm">
                  <div className="text-center">
                    <Users className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                    <p>No attendance data yet</p>
                    <p className="text-xs mt-1">Attendance will appear once employees clock in</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Live Alerts</h3>
              {alerts.length > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                  {alerts.length}
                </span>
              )}
            </div>
            {alerts.length > 0 ? (
              <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {alerts.map((alert, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <span className={cn(
                      "w-2 h-2 rounded-full shrink-0",
                      alert.type === "critical" ? "bg-red-500" : "bg-yellow-500",
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700 dark:text-slate-300 truncate">{alert.message}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{alert.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-5 py-6 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="text-sm">All systems normal</span>
              </div>
            )}
            <Link to="/audit" className="block text-xs font-medium text-center py-3 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 transition-colors border-t border-gray-50 dark:border-slate-700/50">
              View all alerts
            </Link>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Pending Actions</h3>
            </div>
            {pendingActions.filter(a => a.count > 0).length > 0 ? (
              <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                {pendingActions.filter(a => a.count > 0).map((action, i) => (
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
            ) : (
              <div className="px-5 py-6 text-sm text-gray-400 dark:text-slate-500 text-center">No pending actions</div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Today's Schedule</h3>
            </div>
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {scheduleData.map((item, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3">
                  {item.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-300 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm text-gray-700 dark:text-slate-300">{item.label}</p>
                    <p className="text-xs text-gray-400">{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

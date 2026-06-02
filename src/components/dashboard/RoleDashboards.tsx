import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw, Users, UserCheck, UserX, Clock,
  Package, AlertTriangle, Truck, Factory,
  TrendingUp, Wrench, CheckCircle2, Trash2,
  IndianRupee, AlertCircle, Cpu, Circle, X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, Cell, ReferenceLine,
} from "recharts";

function useDashboardData() {
  const { millId } = useActiveMill();
  return useQuery({
    queryKey: ["dashboard-summary", millId],
    queryFn: () => api.get("/dashboard/summary", { params: { mill_id: millId } }).then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    enabled: !!millId,
  });
}

const COLOR_MAP = {
  blue:   { bg: "bg-blue-50 dark:bg-blue-900/20",   icon: "text-blue-600 dark:text-blue-400",   iconBg: "bg-blue-100 dark:bg-blue-900/40" },
  green:  { bg: "bg-green-50 dark:bg-green-900/20", icon: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-100 dark:bg-emerald-900/40" },
  red:    { bg: "bg-red-50 dark:bg-red-900/20",     icon: "text-red-600 dark:text-red-400",     iconBg: "bg-red-100 dark:bg-red-900/40" },
  orange: { bg: "bg-orange-50 dark:bg-orange-900/20", icon: "text-orange-600 dark:text-orange-400", iconBg: "bg-orange-100 dark:bg-orange-900/40" },
  gray:   { bg: "bg-gray-50 dark:bg-slate-800",     icon: "text-gray-500 dark:text-slate-400",  iconBg: "bg-gray-100 dark:bg-slate-700" },
};

type ColorKey = keyof typeof COLOR_MAP;

function DashHeader({ greeting, subtitle, onRefresh, isRefreshing }: {
  greeting: string; subtitle: string;
  onRefresh: () => void; isRefreshing: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          {greeting}
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 px-3 py-1.5 text-sm
          text-gray-600 dark:text-slate-400 border border-gray-200
          dark:border-slate-700 rounded-lg hover:bg-gray-50
          dark:hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={cn("w-3.5 h-3.5",
          isRefreshing && "animate-spin")} />
        Refresh
      </button>
    </div>
  );
}

function KPICard({ title, value, subtitle, icon: Icon, color = "blue", progress }: {
  title: string; value: string; subtitle?: string;
  icon: any; color?: ColorKey; progress?: number;
}) {
  const c = COLOR_MAP[color];
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5
      border border-gray-100 dark:border-slate-700 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider
          text-gray-400 dark:text-slate-500">
          {title}
        </p>
        <div className={cn("w-8 h-8 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center", c.iconBg)}>
          <Icon className={cn("w-4 h-4", c.icon)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && (
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>
      )}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all",
              progress >= 90 ? "bg-emerald-500" :
              progress >= 70 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

function ProductionTrendChart({ data }: { data: any[] }) {
  const hasData = data?.some((d: any) => Number(d.produced) > 0);
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-5
      border border-gray-100 dark:border-slate-700 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
        Production vs Target — Last 7 Days
      </h3>
      <div className="h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.07)" }} />
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
  );
}

// ─── HR MANAGER DASHBOARD ─────────────────────────────────────────────────

export function HRDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const present = Number(d.attendance_present ?? 0);
  const total = Number(d.attendance_total ?? 0);
  const absent = Number(d.attendance_absent ?? 0);
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const pendingLeaves = Number(d.pending_actions?.leave_requests ?? 0);
  const pendingPayroll = Number(d.pending_actions?.payroll_pending ?? 0);

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · HR Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard title="TOTAL EMPLOYEES" value={total.toString()} subtitle="Active workforce" icon={Users} color="blue" />
        <KPICard title="PRESENT TODAY" value={present.toString()} subtitle={`${pct}% attendance rate`} icon={UserCheck} color="green" />
        <KPICard title="ABSENT TODAY" value={absent.toString()} subtitle={`${total > 0 ? Math.round((absent/total)*100) : 0}% of workforce`} icon={UserX} color={absent > total * 0.1 ? "red" : "gray"} />
        <KPICard title="PENDING" value={`${pendingLeaves + pendingPayroll}`} subtitle={`${pendingLeaves} leaves · ${pendingPayroll} payroll`} icon={Clock} color={pendingLeaves + pendingPayroll > 0 ? "orange" : "gray"} />
      </div>

      {(d.dept_attendance ?? []).length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Department Attendance Today</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.dept_attendance} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: "#9ca3af" }} width={80} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => [`${value}%`, "Attendance"]} contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.07)" }} />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {(d.dept_attendance as any[]).map((entry: any, idx: number) => (
                    <Cell key={idx} fill={entry.pct >= 90 ? "#10b981" : entry.pct >= 80 ? "#f59e0b" : "#ef4444"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {pendingLeaves > 0 && (
        <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">
              {pendingLeaves} leave request{pendingLeaves !== 1 ? "s" : ""} pending your approval
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PRODUCTION MANAGER DASHBOARD ─────────────────────────────────────────

export function ProductionDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const prodToday = Number(d.production_today ?? 0);
  const prodTarget = Number(d.production_target ?? 5000);
  const wastePct = Number(d.waste_percent ?? 0);
  const activeMach = Number(d.active_machines ?? 0);
  const totalMach = Number(d.total_machines ?? 0);
  const downMach = totalMach - activeMach;
  const pct = prodTarget > 0 ? Math.round((prodToday / prodTarget) * 100) : 0;
  const qualityPending = Number(d.pending_actions?.quality_approvals ?? 0);

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Production Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard title="TODAY'S PRODUCTION" value={`${prodToday.toLocaleString("en-IN")} kg`} subtitle={`Target: ${prodTarget.toLocaleString("en-IN")} kg`} progress={pct} icon={Factory} color="blue" />
        <KPICard title="EFFICIENCY" value={`${pct}%`} subtitle={pct >= 90 ? "On target" : pct >= 70 ? "Slightly below" : "Below target"} icon={TrendingUp} color={pct >= 90 ? "green" : pct >= 70 ? "orange" : "red"} />
        <KPICard title="WASTE %" value={`${wastePct.toFixed(1)}%`} subtitle="Target: < 4.0%" icon={AlertTriangle} color={wastePct <= 4 ? "green" : wastePct <= 6 ? "orange" : "red"} />
        <KPICard title="ACTIVE MACHINES" value={`${activeMach} / ${totalMach}`} subtitle={downMach > 0 ? `${downMach} machine${downMach > 1 ? "s" : ""} down` : "All running"} icon={Wrench} color={downMach > 0 ? "red" : "green"} />
      </div>

      {(d.production_trend ?? []).length > 0 && <ProductionTrendChart data={d.production_trend} />}

      {qualityPending > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-sm font-medium">{qualityPending} quality test{qualityPending !== 1 ? "s" : ""} pending approval</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── QUALITY MANAGER DASHBOARD ─────────────────────────────────────────────

export function QualityDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const qualityPending = Number(d.pending_actions?.quality_approvals ?? 0);
  const wastePct = Number(d.waste_percent ?? 0);
  const prodToday = Number(d.production_today ?? 0);

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Quality Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <KPICard title="PENDING APPROVALS" value={qualityPending.toString()} subtitle="Quality tests awaiting review" icon={CheckCircle2} color={qualityPending > 0 ? "orange" : "green"} />
        <KPICard title="WASTE %" value={`${wastePct.toFixed(1)}%`} subtitle="Target: < 4.0%" icon={AlertTriangle} color={wastePct <= 4 ? "green" : "red"} />
        <KPICard title="TODAY'S PRODUCTION" value={`${prodToday.toLocaleString("en-IN")} kg`} subtitle="Lots to inspect" icon={Factory} color="blue" />
      </div>
    </div>
  );
}

// ─── ACCOUNTANT DASHBOARD ──────────────────────────────────────────────────

export function AccountsDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const monthlyRev = Number(d.monthly_revenue ?? 0);
  const revTarget = Number(d.revenue_target ?? 1);
  const pendingPay = Number(d.pending_payments ?? 0);
  const overdueCust = Number(d.overdue_customers ?? 0);
  const revPct = revTarget > 0 ? Math.round((monthlyRev / revTarget) * 100) : 0;

  const fmt = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
    return `₹${n}`;
  };

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Accounts Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard title="MONTHLY REVENUE" value={fmt(monthlyRev)} subtitle={`Target: ${fmt(revTarget)}`} progress={revPct} icon={TrendingUp} color="green" />
        <KPICard title="PENDING PAYMENTS" value={fmt(pendingPay)} subtitle={`${overdueCust} customer${overdueCust !== 1 ? "s" : ""} overdue`} icon={AlertCircle} color={pendingPay > 0 ? "red" : "green"} />
        <KPICard title="REVENUE ACHIEVED" value={`${revPct}%`} subtitle={revPct >= 80 ? "On track" : "Behind target"} icon={CheckCircle2} color={revPct >= 80 ? "green" : "orange"} />
        <KPICard title="OVERDUE CUSTOMERS" value={overdueCust.toString()} subtitle="Need follow-up" icon={AlertTriangle} color={overdueCust > 0 ? "red" : "green"} />
      </div>
    </div>
  );
}

// ─── STORES / MAINTENANCE DASHBOARD ───────────────────────────────────────

export function StoresDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const activeMach = Number(d.active_machines ?? 0);
  const totalMach = Number(d.total_machines ?? 0);
  const downMach = totalMach - activeMach;

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Stores & Maintenance Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <KPICard title="ACTIVE MACHINES" value={`${activeMach} / ${totalMach}`} subtitle={downMach > 0 ? `${downMach} down` : "All running"} icon={Wrench} color={downMach > 0 ? "red" : "green"} />
        <KPICard title="MACHINES DOWN" value={downMach.toString()} subtitle="Needs maintenance" icon={AlertTriangle} color={downMach > 0 ? "red" : "green"} />
        <KPICard title="STORE REQUESTS" value="0" subtitle="Pending issue requests" icon={Package} color="blue" />
      </div>
    </div>
  );
}

// ─── DISPATCH MANAGER DASHBOARD ───────────────────────────────────────────

export function DispatchDashboard() {
  const { data: raw, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const d = raw ?? {};

  const dispatchTrips = Number(d.pending_actions?.dispatch_trips ?? 0);

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Dispatch Overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <KPICard title="PENDING TRIPS" value={dispatchTrips.toString()} subtitle="Trips to dispatch today" icon={Truck} color={dispatchTrips > 0 ? "orange" : "green"} />
        <KPICard title="IN TRANSIT" value="0" subtitle="Active deliveries" icon={Truck} color="blue" />
        <KPICard title="DELIVERED TODAY" value="0" subtitle="Completed trips" icon={CheckCircle2} color="green" />
      </div>
    </div>
  );
}

// ─── MILL OWNER DASHBOARD (full view) ─────────────────────────────────────

export function MillOwnerDashboard() {
  const { data: summary, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth(s => s.user);
  const { millName } = useActiveMill();
  const navigate = useNavigate();
  const [alertDismissed, setAlertDismissed] = useState(false);

  const raw = summary ?? {};

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
  const productionTrend = raw.production_trend ?? [];
  const deptAttendance = raw.dept_attendance ?? [];
  const alerts = raw.alerts ?? [];
  const pendingActions = raw.pending_actions ?? [];
  const scheduleData = raw.schedule ?? [];

  const hasCriticalAlerts = !alertDismissed && alerts.length > 0;

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0] ?? "User"}`}
        subtitle={`${millName} · Live operations overview`}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      {hasCriticalAlerts && (
        <div className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-700 dark:text-red-300">
            <strong>Action Required:</strong> {alerts.filter((a: any) => a.type === "critical").length} critical alert(s)
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
          <KPICard title="Today's Production" value={`${prodToday.toLocaleString()} kg`} subtitle={`Target: ${prodTarget.toLocaleString()} kg`} progress={pct} icon={Factory} color="blue" />
          <KPICard title="Waste %" value={`${wastePct.toFixed(1)}%`} subtitle="Target: < 4.0%" icon={Trash2} color="green" />
          <KPICard title="Attendance" value={`${attPresent} / ${attTotal}`} subtitle={`${attTotal > 0 ? ((attPresent / attTotal) * 100).toFixed(1) : 0}% present · ${attAbsent} absent`} icon={Users} color="blue" />
          <KPICard title="Active Machines" value={`${activeMach} / ${totalMach}`} subtitle={`${totalMach - activeMach} machines down`} icon={Cpu} color={totalMach - activeMach > 0 ? "orange" : "green"} />
          <KPICard title="Monthly Revenue" value={`₹${(monthlyRev / 100000).toFixed(1)}L`} progress={revTarget > 0 ? (monthlyRev / revTarget) * 100 : 0} icon={IndianRupee} color="green" />
          <KPICard title="Pending Payments" value={`₹${(pendingPay / 100000).toFixed(1)}L`} subtitle={`${overdueCust} customers overdue`} icon={AlertCircle} color={overdueCust > 0 ? "red" : "gray"} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProductionTrendChart data={productionTrend} />
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Department Attendance Today</h3>
          <div className="h-64">
            {deptAttendance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptAttendance} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="dept" tick={{ fontSize: 11, fill: "#9ca3af" }} width={80} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value: number) => [`${value}%`, "Attendance"]} contentStyle={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, boxShadow: "0 4px 6px rgba(0,0,0,0.07)" }} />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                    {deptAttendance.map((entry: any, idx: number) => (
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
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">{alerts.length}</span>
            )}
          </div>
          {alerts.length > 0 ? (
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {alerts.map((alert: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", alert.type === "critical" ? "bg-red-500" : "bg-yellow-500")} />
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
          {pendingActions.filter((a: any) => a.count > 0).length > 0 ? (
            <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
              {pendingActions.filter((a: any) => a.count > 0).map((action: any, i: number) => (
                <button key={i} onClick={() => navigate({ to: "/audit" })} className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left">
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
            {scheduleData.map((item: any, i: number) => (
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
  );
}

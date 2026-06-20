import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useActiveMill } from "@/hooks/useActiveMill";
import { useAuth } from "@/stores/auth";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  Clock,
  Package,
  AlertTriangle,
  Truck,
  Factory,
  TrendingUp,
  Wrench,
  CheckCircle2,
  IndianRupee,
  AlertCircle,
  Cpu,
  Circle,
  X,
  ShieldCheck,
  BarChart2,
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
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashSummary {
  role?: string;
  mill_name?: string;
  company_name?: string;
  as_of?: string;
  production?: {
    today_output_kg: number;
    today_target_kg: number;
    efficiency_pct: number;
    waste_pct: number;
    last_7_days: { date: string; output_kg: number; target_kg: number }[];
  };
  machines?: { total: number; active: number; down: number; maintenance: number };
  attendance?: {
    today_present: number;
    today_absent: number;
    today_total: number;
    present_pct: number;
    by_department: { department: string; present: number; absent: number }[];
  };
  finance?: {
    monthly_revenue: number;
    monthly_purchases: number;
    outstanding: number;
    overdue_count: number;
    revenue_trend: { month: string; revenue: number; purchases: number }[];
  };
  quality?: {
    tests_today: number;
    pass_rate_pct: number;
    pending_approvals: number;
    defect_rate_pct: number;
  };
  inventory?: {
    total_items: number;
    low_stock_count: number;
    low_stock_items: { name: string; current: number; reorder_level: number; unit: string }[];
  };
  dispatch?: {
    today_trips: number;
    today_sacks: number;
    pending_deliveries: number;
    delivered_today: number;
  };
  payroll?: {
    current_month: string;
    total_employees: number;
    processed_count: number;
    pending_count: number;
    total_payable: number;
  };
  alerts?: { type: "warning" | "error" | "info"; message: string; module: string }[];
  pending_actions?: { label: string; count: number; route: string }[];
  schedule?: { current_shift: string; shift_start: string; shift_end: string };
  // legacy flat fields
  production_today?: number;
  production_target?: number;
  efficiency_today?: number;
  waste_percent?: number;
  production_trend?: { day: string; produced: number; target: number }[];
  dept_attendance?: { dept: string; pct: number }[];
  total_machines?: number;
  active_machines?: number;
  attendance_present?: number;
  attendance_absent?: number;
  attendance_total?: number;
  monthly_revenue?: number;
  revenue_target?: number;
  pending_payments?: number;
  overdue_customers?: number;
}

// ─── Shared hook ─────────────────────────────────────────────────────────────

function useDashboardData() {
  const { millId } = useActiveMill();
  return useQuery<DashSummary>({
    queryKey: ["dashboard-summary", millId],
    queryFn: () =>
      api.get("/dashboard/summary", { params: { mill_id: millId } }).then((r) => r.data),
    staleTime: 3 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
    enabled: !!millId,
  });
}

// ─── Color map ────────────────────────────────────────────────────────────────

const COLOR_MAP = {
  blue: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    icon: "text-blue-600 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
  },
  green: {
    bg: "bg-green-50 dark:bg-green-900/20",
    icon: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-900/20",
    icon: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-100 dark:bg-red-900/40",
  },
  orange: {
    bg: "bg-orange-50 dark:bg-orange-900/20",
    icon: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-100 dark:bg-orange-900/40",
  },
  gray: {
    bg: "bg-gray-50 dark:bg-slate-800",
    icon: "text-gray-500 dark:text-slate-400",
    iconBg: "bg-gray-100 dark:bg-slate-700",
  },
};
type ColorKey = keyof typeof COLOR_MAP;

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtKg(n: number) {
  return n.toLocaleString("en-IN") + " kg";
}
function fmtCurrency(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}
function fmtDate(d: string) {
  return d.slice(5); // MM-DD
}
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function DashHeader({
  greeting,
  subtitle,
  asOf,
  onRefresh,
  isRefreshing,
}: {
  greeting: string;
  subtitle: string;
  asOf?: string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{greeting}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{subtitle}</p>
        {asOf && (
          <p className="text-xs text-gray-300 dark:text-slate-500 mt-0.5">
            Last updated:{" "}
            {new Date(asOf).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="flex items-center gap-2 px-3 py-1.5 text-sm
          text-gray-600 dark:text-slate-400 border border-gray-200
          dark:border-slate-700 rounded-lg hover:bg-gray-50
          dark:hover:bg-slate-700 disabled:opacity-50"
      >
        <RefreshCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
        Refresh
      </button>
    </div>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = "blue",
  progress,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  color?: ColorKey;
  progress?: number;
}) {
  const c = COLOR_MAP[color];
  return (
    <div
      className="bg-white dark:bg-slate-800 rounded-xl lg:rounded-2xl p-4 lg:p-5
      border border-gray-100 dark:border-slate-700 shadow-sm"
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-[10px] lg:text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-slate-500">
          {title}
        </p>
        <div
          className={cn(
            "w-8 h-8 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center",
            c.iconBg,
          )}
        >
          <Icon className={cn("w-4 h-4", c.icon)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{subtitle}</p>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progress >= 90 ? "bg-emerald-500" : progress >= 70 ? "bg-yellow-500" : "bg-red-500",
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function KPISkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={cn(
        "grid gap-3 lg:gap-4",
        count <= 3 ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-4",
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm"
        >
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-7 w-28 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ message }: { message: string }) {
  return <p className="text-xs text-gray-400 dark:text-slate-500 mt-2 italic">{message}</p>;
}

// ─── Production section ───────────────────────────────────────────────────────

function ProductionSection({ data }: { data: DashSummary }) {
  const p = data.production;
  const output = p ? p.today_output_kg : (data.production_today ?? 0);
  const target = p ? p.today_target_kg : (data.production_target ?? 0);
  const eff = p ? p.efficiency_pct : (data.efficiency_today ?? 0);
  const waste = p ? p.waste_pct : (data.waste_percent ?? 0);
  const trend = p
    ? p.last_7_days.map((d) => ({
        day: fmtDate(d.date),
        produced: d.output_kg,
        target: d.target_kg,
      }))
    : (data.production_trend ?? []);
  const pct = target > 0 ? (output / target) * 100 : 0;
  const hasData = trend.some((d) => d.produced > 0);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard
          title="Today's Production"
          value={fmtKg(output)}
          subtitle={`Target: ${fmtKg(target)}`}
          progress={pct}
          icon={Factory}
          color="blue"
        />
        <KPICard
          title="Efficiency"
          value={`${eff.toFixed(1)}%`}
          subtitle={eff >= 90 ? "On target" : eff >= 70 ? "Slightly below" : "Below target"}
          icon={TrendingUp}
          color={eff >= 90 ? "green" : eff >= 70 ? "orange" : "red"}
        />
        <KPICard
          title="Waste %"
          value={`${waste.toFixed(1)}%`}
          subtitle="Target: < 4.0%"
          icon={AlertTriangle}
          color={waste <= 4 ? "green" : waste <= 6 ? "orange" : "red"}
        />
        <KPICard
          title="Target Achievement"
          value={`${pct.toFixed(1)}%`}
          subtitle={pct >= 90 ? "Excellent" : pct >= 70 ? "On track" : "Needs attention"}
          icon={BarChart2}
          color={pct >= 90 ? "green" : pct >= 70 ? "orange" : "red"}
        />
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
          Production vs Target — Last 7 Days
        </h3>
        <div className="h-56">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, name: string) => [
                    fmtKg(v),
                    name === "produced" ? "Actual" : "Target",
                  ]}
                />
                {trend[0]?.target > 0 && (
                  <ReferenceLine
                    y={trend[0].target}
                    stroke="#3b82f6"
                    strokeDasharray="4 4"
                    label={{ value: "Target", position: "right", fontSize: 11, fill: "#3b82f6" }}
                  />
                )}
                <Bar dataKey="produced" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400 dark:text-slate-500 text-sm">
              <div className="text-center">
                <Factory className="w-10 h-10 mx-auto mb-2 text-gray-300 dark:text-slate-600" />
                <p>No production data yet</p>
                <EmptyCard message="Start recording production entries to see trends" />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Machines section ─────────────────────────────────────────────────────────

function MachinesSection({ data }: { data: DashSummary }) {
  const m = data.machines;
  const total = m ? m.total : (data.total_machines ?? 0);
  const active = m ? m.active : (data.active_machines ?? 0);
  const down = m ? m.down : total - active;
  const maint = m ? m.maintenance : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <KPICard
        title="Total Machines"
        value={total.toString()}
        subtitle="Registered"
        icon={Cpu}
        color="gray"
      />
      <KPICard
        title="Running"
        value={active.toString()}
        subtitle="Actively producing"
        icon={CheckCircle2}
        color={active > 0 ? "green" : "gray"}
      />
      <KPICard
        title="Down / Breakdown"
        value={down.toString()}
        subtitle="Needs attention"
        icon={AlertTriangle}
        color={down > 0 ? "red" : "green"}
      />
      <KPICard
        title="Maintenance / Idle"
        value={maint.toString()}
        subtitle="Scheduled maintenance"
        icon={Wrench}
        color={maint > 0 ? "orange" : "green"}
      />
    </div>
  );
}

// ─── Attendance section ───────────────────────────────────────────────────────

function AttendanceSection({ data }: { data: DashSummary }) {
  const a = data.attendance;
  const present = a ? a.today_present : (data.attendance_present ?? 0);
  const absent = a ? a.today_absent : (data.attendance_absent ?? 0);
  const total = a ? a.today_total : (data.attendance_total ?? 0);
  const pct = a ? a.present_pct : total > 0 ? Math.round((present / total) * 100) : 0;
  const byDept = a
    ? a.by_department.map((d) => ({
        dept: d.department,
        pct: d.present + d.absent > 0 ? Math.round((d.present / (d.present + d.absent)) * 100) : 0,
      }))
    : (data.dept_attendance ?? []);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard
          title="Total Employees"
          value={total.toString()}
          subtitle="Active workforce"
          icon={Users}
          color="blue"
        />
        <KPICard
          title="Present Today"
          value={present.toString()}
          subtitle={`${pct}% attendance rate`}
          icon={UserCheck}
          color="green"
        />
        <KPICard
          title="Absent Today"
          value={absent.toString()}
          subtitle={`${total > 0 ? Math.round((absent / total) * 100) : 0}% of workforce`}
          icon={UserX}
          color={absent > total * 0.1 ? "red" : "gray"}
        />
        <KPICard
          title="Attendance Rate"
          value={`${pct}%`}
          subtitle={pct >= 90 ? "Excellent" : pct >= 80 ? "Good" : "Low"}
          progress={pct}
          icon={BarChart2}
          color={pct >= 90 ? "green" : pct >= 80 ? "orange" : "red"}
        />
      </div>
      {byDept.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
            Department Attendance Today
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDept} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="dept"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  width={80}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, "Attendance"]}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {byDept.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.pct >= 90 ? "#10b981" : entry.pct >= 80 ? "#f59e0b" : "#ef4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Finance section ──────────────────────────────────────────────────────────

function FinanceSection({ data }: { data: DashSummary }) {
  const f = data.finance;
  const revenue = f ? f.monthly_revenue : (data.monthly_revenue ?? 0);
  const purchases = f ? f.monthly_purchases : 0;
  const outstanding = f ? f.outstanding : (data.pending_payments ?? 0);
  const overdue = f ? f.overdue_count : (data.overdue_customers ?? 0);
  const trend = f ? f.revenue_trend : [];

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <KPICard
          title="Monthly Revenue"
          value={fmtCurrency(revenue)}
          subtitle="Current month"
          icon={TrendingUp}
          color="green"
        />
        <KPICard
          title="Monthly Purchases"
          value={fmtCurrency(purchases)}
          subtitle="Current month"
          icon={Package}
          color="blue"
        />
        <KPICard
          title="Outstanding"
          value={fmtCurrency(outstanding)}
          subtitle="Receivables pending"
          icon={AlertCircle}
          color={outstanding > 0 ? "orange" : "green"}
        />
        <KPICard
          title="Overdue"
          value={overdue.toString()}
          subtitle="Past due date"
          icon={AlertTriangle}
          color={overdue > 0 ? "red" : "green"}
        />
      </div>
      {trend.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
            Revenue Trend — Last 6 Months
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtCurrency(v)}
                />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    fmtCurrency(v),
                    name === "revenue" ? "Revenue" : "Purchases",
                  ]}
                  contentStyle={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  dataKey="revenue"
                  stroke="#3b82f6"
                  fill="#dbeafe"
                  name="revenue"
                  strokeWidth={2}
                />
                <Area
                  dataKey="purchases"
                  stroke="#f59e0b"
                  fill="#fef3c7"
                  name="purchases"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Quality section ──────────────────────────────────────────────────────────

function QualitySection({ data }: { data: DashSummary }) {
  const q = data.quality;
  if (!q) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <KPICard
        title="Tests Today"
        value={q.tests_today.toString()}
        subtitle="Quality tests run"
        icon={ShieldCheck}
        color="blue"
      />
      <KPICard
        title="Pass Rate"
        value={`${q.pass_rate_pct.toFixed(1)}%`}
        subtitle="Today"
        progress={q.pass_rate_pct}
        icon={CheckCircle2}
        color={q.pass_rate_pct >= 90 ? "green" : "orange"}
      />
      <KPICard
        title="Pending Approvals"
        value={q.pending_approvals.toString()}
        subtitle="Awaiting review"
        icon={Clock}
        color={q.pending_approvals > 0 ? "orange" : "green"}
      />
      <KPICard
        title="Defect Rate"
        value={`${q.defect_rate_pct.toFixed(1)}%`}
        subtitle="Target: < 5%"
        icon={AlertTriangle}
        color={q.defect_rate_pct <= 5 ? "green" : "red"}
      />
    </div>
  );
}

// ─── Inventory section ────────────────────────────────────────────────────────

function InventorySection({ data }: { data: DashSummary }) {
  const inv = data.inventory;
  if (!inv) return null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <KPICard
          title="Total Lots"
          value={inv.total_items.toString()}
          subtitle="In inventory"
          icon={Package}
          color="blue"
        />
        <KPICard
          title="Low Stock"
          value={inv.low_stock_count.toString()}
          subtitle="Below threshold"
          icon={AlertTriangle}
          color={inv.low_stock_count > 0 ? "orange" : "green"}
        />
      </div>
      {inv.low_stock_items.length > 0 && (
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl p-4 border border-gray-100 dark:border-slate-700 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-3">
            Low Stock Items
          </h3>
          <div className="space-y-2">
            {inv.low_stock_items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-slate-300 truncate">{item.name}</span>
                <span className="text-orange-600 dark:text-orange-400 font-medium ml-2 shrink-0">
                  {item.current} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch section ─────────────────────────────────────────────────────────

function DispatchSection({ data }: { data: DashSummary }) {
  const d = data.dispatch;
  if (!d) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <KPICard
        title="Today's Trips"
        value={d.today_trips.toString()}
        subtitle="Dispatched today"
        icon={Truck}
        color="blue"
      />
      <KPICard
        title="Today's Sacks"
        value={d.today_sacks.toString()}
        subtitle="Bags loaded today"
        icon={Package}
        color="blue"
      />
      <KPICard
        title="In Transit"
        value={d.pending_deliveries.toString()}
        subtitle="Active deliveries"
        icon={Truck}
        color={d.pending_deliveries > 0 ? "orange" : "gray"}
      />
      <KPICard
        title="Delivered Today"
        value={d.delivered_today.toString()}
        subtitle="Completed"
        icon={CheckCircle2}
        color="green"
      />
    </div>
  );
}

// ─── Payroll section ──────────────────────────────────────────────────────────

function PayrollSection({ data }: { data: DashSummary }) {
  const pay = data.payroll;
  if (!pay) return null;
  const processedPct =
    pay.total_employees > 0 ? Math.round((pay.processed_count / pay.total_employees) * 100) : 0;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
      <KPICard
        title="Current Month"
        value={pay.current_month}
        subtitle="Payroll period"
        icon={Clock}
        color="gray"
      />
      <KPICard
        title="Processed"
        value={pay.processed_count.toString()}
        subtitle={`of ${pay.total_employees} employees`}
        progress={processedPct}
        icon={CheckCircle2}
        color={processedPct >= 100 ? "green" : "orange"}
      />
      <KPICard
        title="Pending"
        value={pay.pending_count.toString()}
        subtitle="Not finalized"
        icon={AlertCircle}
        color={pay.pending_count > 0 ? "orange" : "green"}
      />
      <KPICard
        title="Total Payable"
        value={fmtCurrency(pay.total_payable)}
        subtitle="Net payable amount"
        icon={IndianRupee}
        color="blue"
      />
    </div>
  );
}

// ─── Alerts section ───────────────────────────────────────────────────────────

function AlertsSection({ alerts }: { alerts: DashSummary["alerts"] }) {
  const list = alerts ?? [];
  if (list.length === 0) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="text-sm">All systems normal</span>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {list.map((alert, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-2 p-2.5 rounded-lg text-sm",
            alert.type === "error" && "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
            alert.type === "warning" &&
              "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300",
            alert.type === "info" &&
              "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
          )}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {alert.message}
        </div>
      ))}
    </div>
  );
}

// ─── Pending Actions section ──────────────────────────────────────────────────

function PendingActionsSection({ actions }: { actions: DashSummary["pending_actions"] }) {
  const navigate = useNavigate();
  const list = (actions ?? []).filter((a) => a.count > 0);
  if (list.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-slate-500 text-center py-4">
        No pending actions
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {list.map((action, i) => (
        <button
          key={i}
          onClick={() => navigate({ to: action.route as any })}
          className="flex justify-between items-center w-full p-2.5 rounded-lg
            hover:bg-muted dark:hover:bg-slate-700/50 text-sm text-left transition-colors"
        >
          <span className="text-gray-600 dark:text-slate-400">{action.label}</span>
          <Badge variant="secondary">{action.count}</Badge>
        </button>
      ))}
    </div>
  );
}

// ─── Schedule section ─────────────────────────────────────────────────────────

function ScheduleSection({ schedule }: { schedule: DashSummary["schedule"] }) {
  if (!schedule) return null;
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2 text-gray-700 dark:text-slate-300">
        <Circle className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="font-medium">Current Shift: {schedule.current_shift}</span>
      </div>
      <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          {schedule.shift_start} — {schedule.shift_end}
        </span>
      </div>
    </div>
  );
}

// ─── Three-column bottom panel (alerts + pending + schedule) ──────────────────

function BottomPanel({ data }: { data: DashSummary }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Live Alerts</h3>
          {(data.alerts?.length ?? 0) > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {data.alerts!.length}
            </span>
          )}
        </div>
        <div className="px-5 py-3">
          <AlertsSection alerts={data.alerts} />
        </div>
      </div>

      {data.pending_actions !== undefined && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Pending Actions
            </h3>
          </div>
          <div className="px-5 py-3">
            <PendingActionsSection actions={data.pending_actions} />
          </div>
        </div>
      )}

      {data.schedule && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
              Today's Schedule
            </h3>
          </div>
          <div className="px-5 py-4">
            <ScheduleSection schedule={data.schedule} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HR MANAGER DASHBOARD ─────────────────────────────────────────────────────

export function HRDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · HR Overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <AttendanceSection data={data} />}
      {data && <PayrollSection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── PRODUCTION MANAGER DASHBOARD ─────────────────────────────────────────────

export function ProductionDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Production Overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <ProductionSection data={data} />}
      {data && data.machines && <MachinesSection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── QUALITY MANAGER DASHBOARD ─────────────────────────────────────────────────

export function QualityDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Quality Overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <QualitySection data={data} />}
      {data?.production && <ProductionSection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── ACCOUNTANT DASHBOARD ─────────────────────────────────────────────────────

export function AccountsDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Accounts Overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <FinanceSection data={data} />}
      {data && <PayrollSection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── STORES / MAINTENANCE DASHBOARD ──────────────────────────────────────────

export function StoresDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Stores & Maintenance`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <MachinesSection data={data} />}
      {data && <InventorySection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── DISPATCH MANAGER DASHBOARD ──────────────────────────────────────────────

export function DispatchDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0]}`}
        subtitle={`${millName} · Dispatch Overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />
      {isLoading ? <KPISkeleton count={4} /> : data && <DispatchSection data={data} />}
      {data && <InventorySection data={data} />}
      {data && <BottomPanel data={data} />}
    </div>
  );
}

// ─── MILL OWNER / GENERAL MANAGER DASHBOARD (full view) ──────────────────────

export function MillOwnerDashboard() {
  const { data, isLoading, isFetching, refetch } = useDashboardData();
  const user = useAuth((s) => s.user);
  const { millName } = useActiveMill();
  const [alertDismissed, setAlertDismissed] = useState(false);

  const criticalAlerts = (data?.alerts ?? []).filter((a) => a.type === "error");
  const showBanner = !alertDismissed && criticalAlerts.length > 0;

  return (
    <div className="space-y-6 p-6 max-w-[1400px] mx-auto">
      <DashHeader
        greeting={`Good ${getGreeting()}, ${user?.name?.split(" ")[0] ?? "User"}`}
        subtitle={`${data?.mill_name || millName} · Live operations overview`}
        asOf={data?.as_of}
        onRefresh={refetch}
        isRefreshing={isFetching}
      />

      {showBanner && (
        <div
          className="flex items-center gap-3 bg-red-50 dark:bg-red-900/20 border border-red-200
          dark:border-red-800 rounded-xl px-4 py-3 text-sm"
        >
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-700 dark:text-red-300">
            <strong>Action Required:</strong> {criticalAlerts.length} critical alert(s)
          </span>
          <button
            onClick={() => setAlertDismissed(true)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <KPISkeleton count={6} />
      ) : data ? (
        <div className="space-y-6">
          {data.production !== undefined && <ProductionSection data={data} />}
          {data.machines !== undefined && <MachinesSection data={data} />}
          {data.attendance !== undefined && <AttendanceSection data={data} />}
          {data.finance !== undefined && <FinanceSection data={data} />}
          {data.quality !== undefined && <QualitySection data={data} />}
          {data.inventory !== undefined && <InventorySection data={data} />}
          {data.dispatch !== undefined && <DispatchSection data={data} />}
          {data.payroll !== undefined && <PayrollSection data={data} />}
        </div>
      ) : null}

      {data && <BottomPanel data={data} />}
    </div>
  );
}

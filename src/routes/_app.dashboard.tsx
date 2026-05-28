import { useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Factory,
  TrendingUp,
  AlertTriangle,
  Truck,
  Recycle,
  IndianRupee,
  Inbox,
  RefreshCw,
  UserPlus,
  Plus,
  ClipboardCheck,
  Activity,
  Users,
  FlaskConical,
  FileText,
  Wrench,
  Settings,
  ArrowRight,
} from "lucide-react";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { cn } from "@/lib/utils";
import { SetupGuide } from "@/components/SetupGuide";
import { RoleGuide } from "@/components/RoleGuide";
import { fmtNumber as fmt } from "@/lib/formatters";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SpinFlow ERP" }] }),
  component: Dashboard,
});

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    warning: "text-warning bg-warning/10",
    danger: "text-destructive bg-destructive/10",
  }[tone];
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className={`size-10 rounded-md flex items-center justify-center ${toneClass}`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function getQuickActions(role: string, navigate: any) {
  const actions: { label: string; icon: any; onClick: () => void }[] = [];
  switch (role) {
    case "SUPER_ADMIN":
    case "MILL_OWNER":
      actions.push(
        { label: "Add User", icon: UserPlus, onClick: () => navigate({ to: "/users" }) },
        { label: "Setup Masters", icon: Settings, onClick: () => navigate({ to: "/masters" }) },
        { label: "View Reports", icon: FileText, onClick: () => navigate({ to: "/reports" }) },
      );
      break;
    case "PRODUCTION_MANAGER":
      actions.push(
        { label: "New Shift Entry", icon: Plus, onClick: () => navigate({ to: "/production" }) },
        { label: "Log Downtime", icon: Activity, onClick: () => navigate({ to: "/production" }) },
        { label: "Daily Report", icon: FileText, onClick: () => navigate({ to: "/reports" }) },
      );
      break;
    case "SUPERVISOR":
      actions.push(
        { label: "Mark Attendance", icon: ClipboardCheck, onClick: () => navigate({ to: "/hr" }) },
        { label: "New Shift Entry", icon: Plus, onClick: () => navigate({ to: "/production" }) },
        { label: "Log Breakdown", icon: Activity, onClick: () => navigate({ to: "/production" }) },
      );
      break;
    case "MACHINE_OPERATOR":
      actions.push(
        { label: "My Production", icon: Plus, onClick: () => navigate({ to: "/production" }) },
        { label: "Log Downtime", icon: Activity, onClick: () => navigate({ to: "/production" }) },
      );
      break;
    case "QUALITY_MANAGER":
      actions.push(
        {
          label: "New Quality Test",
          icon: FlaskConical,
          onClick: () => navigate({ to: "/quality" }),
        },
        { label: "CSP Report", icon: FileText, onClick: () => navigate({ to: "/reports" }) },
      );
      break;
    case "HR_MANAGER":
      actions.push(
        { label: "Mark Attendance", icon: ClipboardCheck, onClick: () => navigate({ to: "/hr" }) },
        { label: "Approve Leave", icon: Users, onClick: () => navigate({ to: "/hr" }) },
        { label: "Run Payroll", icon: IndianRupee, onClick: () => navigate({ to: "/payroll" }) },
        { label: "Add Employee", icon: UserPlus, onClick: () => navigate({ to: "/hr" }) },
      );
      break;
    case "DISPATCH_MANAGER":
      actions.push(
        { label: "New Trip", icon: Truck, onClick: () => navigate({ to: "/lotrac" }) },
        { label: "Dispatch Report", icon: FileText, onClick: () => navigate({ to: "/reports" }) },
      );
      break;
    case "ACCOUNTANT":
      actions.push(
        { label: "New Invoice", icon: FileText, onClick: () => navigate({ to: "/accounts" }) },
        { label: "GST Summary", icon: IndianRupee, onClick: () => navigate({ to: "/accounts" }) },
        { label: "Monthly P&L", icon: IndianRupee, onClick: () => navigate({ to: "/accounts" }) },
      );
      break;
    case "MAINTENANCE_MANAGER":
      actions.push(
        { label: "Log Breakdown", icon: Wrench, onClick: () => navigate({ to: "/maintenance" }) },
        { label: "View Spares", icon: Inbox, onClick: () => navigate({ to: "/stores" }) },
      );
      break;
    case "STORE_MANAGER":
      actions.push(
        { label: "Manage Spares", icon: Inbox, onClick: () => navigate({ to: "/stores" }) },
        { label: "Low Stock", icon: AlertTriangle, onClick: () => navigate({ to: "/stores" }) },
      );
      break;
    default:
      actions.push({ label: "Dashboard", icon: TrendingUp, onClick: () => navigate({ to: "/" }) });
  }
  return actions;
}

function Dashboard() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const recentActivity = useRecentActivity();

  const summaryQ = useQuery({
    queryKey: ["dashboard-summary", user?.millId ?? ""],
    queryFn: () => api.get("/dashboard/summary").then(r => r.data),
    enabled: !!user?.millId,
  });

  const { data, isLoading, isError, error, refetch, isRefetching } = summaryQ;
  const raw = data ?? {};

  if (!user) return null;

  const safeData = {
    productionToday: Number(raw.production_today ?? 0),
    productionTarget: Number(raw.production_target ?? 1),
    efficiency: Number(raw.efficiency_today ?? 0),
    wastePercent: Number(raw.waste_percent ?? 0),
    activeDowntime: Number(raw.active_breakdowns ?? 0),
    stockValue: Number(raw.stock_value ?? 0),
    pendingDispatch: Number(raw.pending_dispatch ?? 0),
    qualityRejection: Number(raw.quality_rejection ?? 0),
    targetAchievement: Number(raw.target_achievement ?? 0),
    avgEfficiency7d: Number(raw.avg_efficiency_7d ?? 0),
    prevWeekEfficiency: Number(raw.prev_week_efficiency ?? 0),
    totalEmployees: Number(raw.total_employees ?? 0),
    trend: Array.isArray(raw.trend) ? raw.trend : [],
    byDept: Array.isArray(raw.by_dept) ? raw.by_dept : [],
  };

  const roleCards = useMemo(() => {
    const role = user.role;
    const allCards: Record<string, React.ReactNode> = {
      productionToday: (
        <Kpi icon={Factory} label="Production Today" value={`${fmt(safeData.productionToday)} kg`} sub={`Target ${fmt(safeData.productionTarget)} kg`} />
      ),
      efficiency: (
        <Kpi icon={TrendingUp} label="Overall Efficiency" value={`${safeData.efficiency.toFixed(1)}%`} sub="Plant average" tone="success" />
      ),
      activeDowntime: (
        <Kpi icon={AlertTriangle} label="Active Breakdowns" value={`${safeData.activeDowntime}`} sub="Open events" tone={safeData.activeDowntime > 0 ? "danger" : "success"} />
      ),
      avgEfficiency: (
        <Kpi icon={TrendingUp} label="Avg Efficiency (7d)" value={`${safeData.avgEfficiency7d.toFixed(1)}%`} sub={safeData.avgEfficiency7d >= safeData.prevWeekEfficiency ? "↑ vs last week" : "↓ vs last week"} tone={safeData.avgEfficiency7d >= safeData.prevWeekEfficiency ? "success" : "warning"} />
      ),
      stockValue: (
        <Kpi icon={IndianRupee} label="Stock Value" value={`₹${(safeData.stockValue / 10000000).toFixed(2)} Cr`} sub="Cotton + Yarn" />
      ),
      pendingDispatch: (
        <Kpi icon={Truck} label="Pending Dispatch" value={`${safeData.pendingDispatch}`} sub="Orders" tone={safeData.pendingDispatch > 0 ? "warning" : "success"} />
      ),
      qualityRejection: (
        <Kpi icon={AlertTriangle} label="Quality Rejection" value={`${safeData.qualityRejection.toFixed(1)}%`} sub="This week" tone={safeData.qualityRejection > 5 ? "danger" : "warning"} />
      ),
      targetAchievement: (
        <Card>
          <CardContent className="p-5">
            <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">Target Achievement</div>
            <div className="mt-3 text-2xl font-semibold tracking-tight">{safeData.targetAchievement.toFixed(1)}%</div>
            <Progress value={Math.min(safeData.targetAchievement, 100)} className="mt-3 h-2" />
          </CardContent>
        </Card>
      ),
    };

    if (["SUPER_ADMIN", "MILL_OWNER"].includes(role)) {
      return Object.values(allCards);
    }
    if (["PRODUCTION_MANAGER", "SUPERVISOR"].includes(role)) {
      return [allCards.productionToday, allCards.efficiency, allCards.activeDowntime, allCards.targetAchievement];
    }
    if (role === "QUALITY_MANAGER") {
      return [allCards.qualityRejection, allCards.efficiency, allCards.targetAchievement];
    }
    if (role === "HR_MANAGER") {
      return [allCards.efficiency, allCards.targetAchievement];
    }
    if (role === "ACCOUNTANT") {
      return [allCards.stockValue, allCards.pendingDispatch, allCards.targetAchievement];
    }
    if (role === "DISPATCH_MANAGER") {
      return [allCards.pendingDispatch, allCards.productionToday, allCards.targetAchievement];
    }
    if (role === "MAINTENANCE_MANAGER") {
      return [allCards.activeDowntime, allCards.efficiency, allCards.targetAchievement];
    }
    if (role === "STORE_MANAGER") {
      return [allCards.stockValue, allCards.productionToday];
    }
    if (role === "MACHINE_OPERATOR") {
      return [allCards.productionToday, allCards.efficiency];
    }
    return Object.values(allCards);
  }, [user.role, safeData]);

  if (isLoading) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Loading..." />
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="h-3 w-20 mb-2" />
                  <Skeleton className="h-7 w-28 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <Topbar title="Dashboard" subtitle="Could not load dashboard data" />
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm text-muted-foreground">
              Could not load dashboard data.
              <button onClick={() => refetch()} className="ml-2 underline font-medium">
                Retry
              </button>
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{roleCards}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={`Good day, ${user.name.split(" ")[0]}`}
        subtitle={`${user.millName} · Live operations overview`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`size-3 mr-1 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </Topbar>
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {user.role === "SUPER_ADMIN" || user.role === "MILL_OWNER" ? <SetupGuide /> : null}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {roleCards}
        </div>

        {user.role === "SUPER_ADMIN" || user.role === "MILL_OWNER" ? <RoleGuide /> : null}

        {(() => {
          const qa = getQuickActions(user.role, navigate);
          if (qa.length === 0) return null;
          return (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h3>
              <div className="flex flex-wrap gap-2">
                {qa.map((a) => (
                  <Button
                    key={a.label}
                    variant="outline"
                    size="sm"
                    onClick={a.onClick}
                    className="gap-1.5"
                  >
                    <a.icon className="size-4" />
                    {a.label}
                    <ArrowRight className="size-3" />
                  </Button>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Production vs Target — Last 7 days</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {safeData.trend && safeData.trend.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={safeData.trend}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--color-primary))" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="hsl(var(--color-primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="produced"
                      stroke="var(--color-primary)"
                      fill="url(#g1)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="target"
                      stroke="var(--color-muted-foreground)"
                      fill="transparent"
                      strokeDasharray="4 4"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No trend data available
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Efficiency by Department</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {safeData.byDept && safeData.byDept.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={safeData.byDept} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--color-border)"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        stroke="var(--color-muted-foreground)"
                        fontSize={12}
                      />
                      <YAxis
                        type="category"
                        dataKey="dept"
                        stroke="var(--color-muted-foreground)"
                        fontSize={11}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "var(--color-card)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="efficiency" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No department data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Machine Status</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {safeData.byDept && safeData.byDept.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Running", value: 12, fill: "hsl(var(--color-success))" },
                          { name: "Idle", value: 3, fill: "hsl(var(--color-warning))" },
                          { name: "Breakdown", value: 1, fill: "hsl(var(--color-destructive))" },
                        ]}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {[{ name: "Running", fill: "hsl(var(--color-success))" }, { name: "Idle", fill: "hsl(var(--color-warning))" }, { name: "Breakdown", fill: "hsl(var(--color-destructive))" }].map((entry, idx) => (
                          <Cell key={idx} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No machine data
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Link
                to="/audit"
                className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentActivity.isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <Skeleton className="size-2 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                    <Skeleton className="h-2.5 w-12 shrink-0" />
                  </div>
                ))}
              </div>
            ) : recentActivity.isError ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <AlertTriangle className="size-8" />
                <p className="text-sm">Could not load activity</p>
                <Button variant="outline" size="sm" onClick={() => recentActivity.refetch()}>
                  <RefreshCw className="size-3 mr-1" />
                  Retry
                </Button>
              </div>
            ) : recentActivity.items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                <Inbox className="size-8" />
                <p className="text-sm">No recent activity</p>
              </div>
            ) : (
              <div className="divide-y text-sm">
                {recentActivity.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        item.color === "green" && "bg-success",
                        item.color === "red" && "bg-destructive",
                        item.color === "blue" && "bg-primary",
                        item.color === "gray" && "bg-muted-foreground",
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.subtitle}</div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">{item.time}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

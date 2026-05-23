import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "@/lib/api-service";
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

  const {
    data: rawData,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["dashboard-kpis", user?.millId ?? ""],
    queryFn: () => dashboardApi.getKpis(user!.millId),
    enabled: !!user,
    refetchInterval: 60000,
    staleTime: 60_000,
    retry: 1,
  });

  const data = rawData ?? undefined;

  if (!user) return null;

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
        <Topbar title="Dashboard" subtitle="Error loading data" />
        <div className="p-6 flex flex-col items-center gap-4 py-20 text-muted-foreground">
          <AlertTriangle className="size-10" />
          <p className="text-sm">Failed to load dashboard KPIs</p>
          <p className="text-xs text-muted-foreground">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`size-3 mr-1 ${isRefetching ? "animate-spin" : ""}`} />
            Retry
          </Button>
        </div>
      </>
    );
  }

  // Defensive defaults for all data properties
  const safeData = {
    productionToday: data?.productionToday ?? 0,
    productionTarget: data?.productionTarget ?? 1,
    efficiency: data?.efficiency ?? 0,
    wastePercent: data?.wastePercent ?? 0,
    activeDowntime: data?.activeDowntime ?? 0,
    stockValue: data?.stockValue ?? 0,
    pendingDispatch: data?.pendingDispatch ?? 0,
    qualityRejection: data?.qualityRejection ?? 0,
    trend: data?.trend ?? [],
    byDept: data?.byDept ?? [],
  };

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
          <Kpi
            icon={Factory}
            label="Production Today"
            value={`${safeData.productionToday.toLocaleString()} kg`}
            sub={`Target ${safeData.productionTarget.toLocaleString()} kg`}
          />
          <Kpi
            icon={TrendingUp}
            label="Overall Efficiency"
            value={`${safeData.efficiency}%`}
            sub="Plant average"
            tone="success"
          />
          <Kpi
            icon={Recycle}
            label="Waste %"
            value={`${safeData.wastePercent}%`}
            sub="Below 3% target"
            tone="warning"
          />
          <Kpi
            icon={AlertTriangle}
            label="Active Downtime"
            value={`${safeData.activeDowntime}`}
            sub="Open events"
            tone="danger"
          />
          <Kpi
            icon={IndianRupee}
            label="Stock Value"
            value={`₹${(safeData.stockValue / 10000000).toFixed(2)} Cr`}
            sub="Cotton + Yarn"
          />
          <Kpi
            icon={Truck}
            label="Pending Dispatch"
            value={`${safeData.pendingDispatch}`}
            sub="Orders"
          />
          <Kpi
            icon={AlertTriangle}
            label="Quality Rejection"
            value={`${safeData.qualityRejection}%`}
            sub="This week"
            tone="warning"
          />
          <Card>
            <CardContent className="p-5">
              <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">
                Target Achievement
              </div>
              <div className="mt-3 text-2xl font-semibold tracking-tight">
                {`${Math.round((safeData.productionToday / Math.max(safeData.productionTarget, 1)) * 100)}%`}
              </div>
              <Progress
                value={Math.min(
                  (safeData.productionToday / Math.max(safeData.productionTarget, 1)) * 100,
                  100,
                )}
                className="mt-3 h-2"
              />
            </CardContent>
          </Card>
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

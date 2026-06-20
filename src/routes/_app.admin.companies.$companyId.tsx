import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  Building2,
  Users,
  Blocks,
  CreditCard,
  ClipboardList,
  Activity,
  Shield,
  Zap,
  DollarSign,
  BarChart3,
  ExternalLink,
  Download,
  Receipt,
  Store,
  UserPlus,
  RefreshCw,
  AlertTriangle,
  Bell,
  CalendarDays,
  CircleAlert,
} from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_app/admin/companies/$companyId")({
  head: () => ({ meta: [{ title: "Company Detail — Admin — SpinFlow ERP" }] }),
  component: CompanyDetailPage,
});

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-red-100 text-red-800",
  archived: "bg-gray-100 text-gray-600",
};

function HealthScore({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  const label = score >= 80 ? "Good" : score >= 50 ? "Fair" : "Critical";
  return (
    <div className="flex items-center gap-3">
      <div className="relative size-14">
        <svg className="size-14 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="16" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="16"
            fill="none"
            stroke={score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"}
            strokeWidth="3"
            strokeDasharray={`${score * 1.005} 100`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
          {score}
        </span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Health Score</p>
        <p className="font-semibold text-sm">{label}</p>
      </div>
    </div>
  );
}

function UsageBar({
  used,
  limit,
  label,
  icon: Icon,
  color,
}: {
  used: number;
  limit: number;
  label: string;
  icon: any;
  color: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : color;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <span className="font-medium">
          {used} <span className="text-muted-foreground font-normal">/ {limit}</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const {
    data: company,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["company-detail", companyId],
    queryFn: () => adminApi.getCompanyDetail(companyId),
  });

  const handleSuspend = async () => {
    try {
      await api.post(`/admin/companies/${companyId}/suspend`);
      toast.success("Company suspended. Mills, users, and sessions disabled.");
      qc.invalidateQueries({ queryKey: ["company-detail"] });
      qc.invalidateQueries({ queryKey: ["masters"] });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? err?.response?.data?.detail ?? "Failed to suspend",
      );
    }
  };

  const handleReactivate = async () => {
    try {
      await api.post(`/admin/companies/${companyId}/reactivate`);
      toast.success("Company reactivated. Mills and users restored.");
      qc.invalidateQueries({ queryKey: ["company-detail"] });
      qc.invalidateQueries({ queryKey: ["masters"] });
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ?? err?.response?.data?.detail ?? "Failed to reactivate",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-96 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-4 gap-4 mt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    const status = (error as any)?.response?.status;
    const isNotFound = status === 404;
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          {isNotFound ? (
            <>
              <Building2 className="size-12 text-muted-foreground/40 mb-4" />
              <p className="text-lg font-medium">Company not found</p>
              <p className="text-sm text-muted-foreground mt-1">
                The company you are looking for does not exist or has been removed.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="size-12 text-red-300 mb-4" />
              <p className="text-lg font-medium text-red-700 dark:text-red-400">
                Failed to load company details
              </p>
              <p className="text-sm text-red-500 mt-1">
                {(error as any)?.response?.data?.detail ??
                  (error as any)?.message ??
                  "Request failed"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => qc.invalidateQueries({ queryKey: ["company-detail", companyId] })}
              >
                Retry
              </Button>
            </>
          )}
          <Link
            to="/admin/companies"
            className="text-sm text-blue-600 hover:underline mt-4 inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3.5" /> Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  if (!company) {
    return null;
  }

  const userLimit = company.stats?.user_limit ?? company.max_users ?? 50;
  const userCount = company.stats?.user_count || 0;
  const millCount = company.stats?.mill_count || 0;
  const millLimit = company.stats?.mill_limit ?? company.stats?.included_mills ?? 5;
  const employeeCount = company.stats?.employee_count || 0;
  const employeeLimit = company.stats?.employee_limit ?? company.max_employees ?? 500;
  const modCount = company.stats?.enabled_modules_count || 0;
  const modTotal = company.stats?.total_modules || 22;

  const healthFactors = [
    { label: "Subscription", ok: company.status === "active", weight: 40 },
    { label: "User Limit", ok: userCount <= userLimit, weight: 20 },
    { label: "Mill Limit", ok: millCount <= millLimit, weight: 15 },
    { label: "Employee Limit", ok: employeeCount <= employeeLimit, weight: 15 },
    { label: "Payment", ok: company.subscription?.status !== "overdue", weight: 10 },
  ];
  const healthScore = healthFactors.reduce((sum, f) => sum + (f.ok ? f.weight : 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/admin" className="hover:text-foreground">
          Admin
        </Link>
        <span>/</span>
        <Link to="/admin/companies" className="hover:text-foreground">
          Companies
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{company.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <HealthScore score={healthScore} />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <Badge className={STATUS_BADGE[company.status] ?? ""}>{company.status}</Badge>
              {company.subscription?.overdue_status === "overdue" && (
                <Badge className="bg-amber-100 text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="size-3" /> Overdue
                </Badge>
              )}
              {company.subscription?.expires_at &&
                !company.subscription?.overdue_status &&
                (() => {
                  const daysLeft = Math.ceil(
                    (new Date(company.subscription.expires_at).getTime() - Date.now()) / 86400000,
                  );
                  if (daysLeft > 30) return null;
                  return (
                    <Badge
                      className={
                        daysLeft > 0 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                      }
                    >
                      <CalendarDays className="size-3 mr-1" />
                      {daysLeft > 0 ? `${daysLeft}d remaining` : "Expired"}
                    </Badge>
                  );
                })()}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Code: {company.code}
              {company.gstin && <> &middot; GST: {company.gstin}</>}
              {company.created_at && (
                <>
                  {" "}
                  &middot; Since{" "}
                  {new Date(company.created_at).toLocaleDateString("en-IN", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/admin/billing" })}>
            <DollarSign className="size-4 mr-1" /> Billing
          </Button>
          {company.status === "active" && (
            <Button variant="destructive" size="sm" onClick={handleSuspend}>
              <Ban className="size-4 mr-1" /> Suspend
            </Button>
          )}
          {company.status === "suspended" && (
            <Button variant="default" size="sm" onClick={handleReactivate}>
              <CheckCircle className="size-4 mr-1" /> Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* Usage Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UsageBar
            used={userCount}
            limit={userLimit}
            label="Users"
            icon={Users}
            color="bg-blue-500"
          />
          <UsageBar
            used={millCount}
            limit={Math.max(millLimit, 1)}
            label="Mills"
            icon={Store}
            color="bg-indigo-500"
          />
          <UsageBar
            used={employeeCount}
            limit={Math.max(employeeLimit, 1)}
            label="Employees"
            icon={Users}
            color="bg-violet-500"
          />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "View Billing",
            icon: Receipt,
            onClick: () => setTab("billing"),
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "Add Mill",
            icon: Store,
            onClick: () => setTab("mills"),
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            label: "Manage Users",
            icon: UserPlus,
            onClick: () => setTab("users"),
            color: "text-green-600 bg-green-50",
          },
          {
            label: "View Modules",
            icon: Blocks,
            onClick: () => setTab("modules"),
            color: "text-purple-600 bg-purple-50",
          },
        ].map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`flex items-center gap-2 px-4 py-3 rounded-lg ${action.color} hover:opacity-80 transition-opacity text-sm font-medium`}
          >
            <action.icon className="size-4" /> {action.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mills</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {millCount}
              <span className="text-sm font-normal text-muted-foreground"> / {millLimit}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Users
            </CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {userCount}
              <span className="text-sm font-normal text-muted-foreground"> / {userLimit}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules</CardTitle>
            <Blocks className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {modCount}
              <span className="text-sm font-normal text-muted-foreground"> / {modTotal}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Plan</CardTitle>
            <CreditCard className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{company.plan}</p>
          </CardContent>
        </Card>
      </div>

      {/* License Health + Subscription Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">License Health</CardTitle>
            <Shield className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {healthFactors.slice(0, 4).map((f) => (
                <div key={f.label} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{f.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={f.ok ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}
                    >
                      {f.ok ? `${usedStr(f)}` : "Exceeded"}
                    </span>
                    {f.ok ? (
                      <CheckCircle className="size-3.5 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="size-3.5 text-red-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Subscription Health</CardTitle>
            <Activity className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium capitalize">{company.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-medium capitalize">{company.plan}</span>
            </div>
            {company.subscription && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Billing Cycle</span>
                  <span className="font-medium capitalize">
                    {company.subscription.billing_cycle}
                  </span>
                </div>
                {company.subscription.expires_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renewal</span>
                    <span className="font-medium">
                      {new Date(company.subscription.expires_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                )}
                {company.subscription.overdue_status === "overdue" && (
                  <div className="flex justify-between text-amber-600">
                    <span className="text-amber-600">Payment Status</span>
                    <span className="font-medium">Overdue</span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Open Alerts */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="size-4" /> Open Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const alerts: { label: string; type: "critical" | "warning" | "info" }[] = [];
            if (company.status === "suspended")
              alerts.push({ label: "Company is suspended", type: "critical" });
            if (company.subscription?.overdue_status === "overdue")
              alerts.push({ label: "Payment is overdue", type: "critical" });
            if (userCount > userLimit)
              alerts.push({
                label: `User limit exceeded (${userCount}/${userLimit})`,
                type: "warning",
              });
            if (millCount > millLimit)
              alerts.push({
                label: `Mill limit exceeded (${millCount}/${millLimit})`,
                type: "warning",
              });
            if (employeeCount > employeeLimit)
              alerts.push({
                label: `Employee limit exceeded (${employeeCount}/${employeeLimit})`,
                type: "warning",
              });
            if (company.subscription?.expires_at) {
              const daysLeft = Math.ceil(
                (new Date(company.subscription.expires_at).getTime() - Date.now()) / 86400000,
              );
              if (daysLeft > 0 && daysLeft <= 30)
                alerts.push({ label: `Subscription renews in ${daysLeft} days`, type: "warning" });
              if (daysLeft <= 0)
                alerts.push({ label: "Subscription has expired", type: "critical" });
            }
            if (alerts.length === 0)
              alerts.push({ label: "No active alerts — all systems nominal", type: "info" });
            return (
              <div className="space-y-1.5">
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                      a.type === "critical"
                        ? "bg-red-50 text-red-700"
                        : a.type === "warning"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    <CircleAlert
                      className={`size-4 shrink-0 ${
                        a.type === "critical"
                          ? "text-red-500"
                          : a.type === "warning"
                            ? "text-amber-500"
                            : "text-blue-500"
                      }`}
                    />
                    {a.label}
                  </div>
                ))}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mills">Mills ({millCount})</TabsTrigger>
            <TabsTrigger value="users">Users ({userCount})</TabsTrigger>
            <TabsTrigger value="modules">Modules ({modCount})</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="font-medium">{company.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Code</span>
                <p className="font-medium">{company.code}</p>
              </div>
              <div>
                <span className="text-muted-foreground">GSTIN</span>
                <p className="font-medium">{company.gstin || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="font-medium">{company.phone || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Email</span>
                <p className="font-medium">{company.email || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Address</span>
                <p className="font-medium">{company.address || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <p className="font-medium capitalize">{company.status}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Plan</span>
                <p className="font-medium capitalize">{company.plan}</p>
              </div>
            </CardContent>
          </Card>

          {company.recent_audit && company.recent_audit.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Events</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {company.recent_audit.slice(0, 10).map((entry: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-3 border-b last:border-0">
                      <div className="size-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <ClipboardList className="size-4 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm capitalize">
                          {entry.action?.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{entry.details}</p>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {entry.created_at
                          ? new Date(entry.created_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mills">
          <ErrorBoundary>
            <MillsTab companyId={companyId} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="users">
          <ErrorBoundary>
            <UsersTab companyId={companyId} company={company} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="modules">
          <ErrorBoundary>
            <ModulesTab companyId={companyId} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="roles">
          <ErrorBoundary>
            <RolesTab companyId={companyId} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="billing">
          <ErrorBoundary>
            <BillingTab companyId={companyId} company={company} />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="audit">
          <ErrorBoundary>
            <AuditTab companyId={companyId} />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function usedStr(f: any) {
  return "Active";
}

/* ── Mills Tab ────────────────────────────────────────── */

function MillsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: mills, isLoading } = useQuery({
    queryKey: ["mills", companyId],
    queryFn: () => mastersApi.getMills(companyId).then((r: any) => r ?? []),
  });

  const suspendMill = useMutation({
    mutationFn: (millId: string) => api.post(`/admin/mills/${millId}/suspend`).then((r) => r.data),
    onSuccess: (_, millId) => {
      qc.invalidateQueries({ queryKey: ["mills", companyId] });
      toast.success("Mill suspended — users and sessions deactivated");
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to suspend mill"),
  });

  const reactivateMill = useMutation({
    mutationFn: (millId: string) =>
      api.post(`/admin/mills/${millId}/reactivate`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mills", companyId] });
      toast.success("Mill reactivated — users restored");
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to reactivate mill"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mills</CardTitle>
        <p className="text-xs text-muted-foreground">
          Suspending a mill deactivates all its users and sessions
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : !mills || mills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No mills found</p>
            <p className="text-xs text-muted-foreground mt-1">
              This company has no mills configured yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Code</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">City</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">State</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {mills.map((m: any) => {
                  const active = m.is_active !== false;
                  const busy = suspendMill.isPending || reactivateMill.isPending;
                  return (
                    <tr key={m.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">{m.name}</td>
                      <td className="px-4 py-2 text-muted-foreground font-mono text-xs">
                        {m.code}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                        {m.city || "—"}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                        {m.state || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <Badge
                          className={
                            active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                          }
                        >
                          {active ? "Active" : "Suspended"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        {active ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            disabled={busy}
                            onClick={() => suspendMill.mutate(m.id)}
                          >
                            Suspend Mill
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                            disabled={busy}
                            onClick={() => reactivateMill.mutate(m.id)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Users Tab ────────────────────────────────────────── */

function UsersTab({ companyId, company }: { companyId: string; company: any }) {
  const { data: users } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: () =>
      api
        .get(`/admin/users?company_id=${companyId}&page_size=500`)
        .then((r: any) => r.data?.data ?? r.data ?? []),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>
          Users ({company.stats?.user_count ?? 0} / {company.stats?.user_limit ?? company.max_users}
          )
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!users || users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No users found</p>
            <p className="text-xs text-muted-foreground mt-1">This company has no users yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Role</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(users) ? users : []).map((u: any) => (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{u.full_name ?? u.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">
                      {u.role ?? u.role_code}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        className={
                          u.is_active !== false
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        }
                      >
                        {u.is_active !== false ? "Active" : "Suspended"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Modules Tab ──────────────────────────────────────── */

function ModulesTab({ companyId }: { companyId: string }) {
  const { data: modules } = useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => adminApi.getCompanyModules(companyId),
  });

  const modList = modules ? Object.entries(modules) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modules</CardTitle>
      </CardHeader>
      <CardContent>
        {modList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Blocks className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No modules configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              This company has no modules enabled.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {modList.map(([name, enabled]) => (
              <div
                key={name}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  enabled ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-400"
                }`}
              >
                <div
                  className={`size-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                />
                <span className="capitalize truncate">{name.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Billing Tab ──────────────────────────────────────── */

function BillingTab({ companyId, company }: { companyId: string; company: any }) {
  const { data: billing } = useQuery({
    queryKey: ["company-billing", companyId],
    queryFn: () => adminApi.getCompanyBillingDetail(companyId),
    enabled: !!company,
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Billing & Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {!billing ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Plan</span>
                <p className="font-medium capitalize">{billing.plan_name ?? billing.plan_code}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Status</span>
                <p className="font-medium capitalize">{billing.status}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Billing Cycle</span>
                <p className="font-medium capitalize">{billing.billing_cycle}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Users</span>
                <p className="font-medium">
                  {billing.user_count ?? 0} / {billing.user_limit ?? 0}
                </p>
              </div>
              {billing.cost && (
                <>
                  <div>
                    <span className="text-muted-foreground">Monthly</span>
                    <p className="font-medium">
                      ₹{(billing.cost.total_monthly ?? 0).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Yearly</span>
                    <p className="font-medium">
                      ₹{(billing.cost.total_yearly ?? 0).toLocaleString("en-IN")}
                    </p>
                  </div>
                </>
              )}
              <div>
                <span className="text-muted-foreground">Mills</span>
                <p className="font-medium">
                  {billing.mill_count ?? 0} / {billing.mill_limit ?? 0}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/admin/billing?company=${companyId}`, "_self")}
        >
          <ExternalLink className="size-4 mr-1" /> Full Billing View
        </Button>
      </div>
    </div>
  );
}

/* ── Audit Tab ────────────────────────────────────────── */

function AuditTab({ companyId }: { companyId: string }) {
  const { data: audit } = useQuery({
    queryKey: ["company-audit", companyId],
    queryFn: () =>
      api
        .get(`/audit/logs?entity_id=${companyId}&page_size=50`)
        .then((r: any) => r.data?.data ?? []),
  });

  const entries = Array.isArray(audit) ? audit : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No audit entries</p>
            <p className="text-xs text-muted-foreground mt-1">
              No activity has been logged for this company yet.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">User</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Details</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{e.action}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.user_name}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate hidden md:table-cell">
                      {e.details}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {e.created_at
                        ? new Date(e.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Roles Tab ────────────────────────────────────────── */

const ALL_ROLES = [
  { code: "MILL_OWNER", label: "Mill Owner", protected: true },
  { code: "GENERAL_MANAGER", label: "General Manager", protected: false },
  { code: "PRODUCTION_MANAGER", label: "Production Manager", protected: false },
  { code: "QUALITY_MANAGER", label: "Quality Manager", protected: false },
  { code: "DISPATCH_MANAGER", label: "Dispatch Manager", protected: false },
  { code: "HR_MANAGER", label: "HR Manager", protected: false },
  { code: "ACCOUNTANT", label: "Accountant", protected: false },
  { code: "MAINTENANCE_MANAGER", label: "Maintenance Manager", protected: false },
  { code: "STORE_MANAGER", label: "Store Manager", protected: false },
  { code: "SUPERVISOR", label: "Supervisor", protected: false },
  { code: "MACHINE_OPERATOR", label: "Machine Operator", protected: false },
  { code: "SECURITY_GATE", label: "Security Gate", protected: false },
  { code: "AUDITOR", label: "Auditor", protected: false },
];

const ALL_MODULES = [
  { key: "production", label: "Production" },
  { key: "quality", label: "Quality" },
  { key: "maintenance", label: "Maintenance" },
  { key: "hr", label: "HR" },
  { key: "payroll", label: "Payroll" },
  { key: "purchase", label: "Purchase" },
  { key: "stores", label: "Stores" },
  { key: "inventory", label: "Inventory" },
  { key: "dispatch", label: "Dispatch" },
  { key: "lotrac", label: "LoTrac" },
  { key: "accounts", label: "Accounts" },
  { key: "reports", label: "Reports" },
  { key: "masters", label: "Masters" },
  { key: "stock", label: "Stock" },
  { key: "dashboard", label: "Dashboard" },
];

type RoleConfig = { role_code: string; is_enabled: boolean; monthly_fee: number };
type ModuleOverrides = Record<string, Record<string, boolean>>; // role_code → module_key → is_allowed

function RolesTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [dirty, setDirty] = useState(false);
  const [feeEdits, setFeeEdits] = useState<Record<string, string>>({});

  // Role config (enabled/disabled + monthly fee per role)
  const roleConfigQ = useQuery<RoleConfig[]>({
    queryKey: ["company-role-config", companyId],
    queryFn: () => api.get(`/admin/companies/${companyId}/role-config`).then((r) => r.data),
    staleTime: 60_000,
  });

  // Role→module overrides matrix
  const roleModulesQ = useQuery<{ company_id: string; overrides: ModuleOverrides }>({
    queryKey: ["company-role-modules", companyId],
    queryFn: () => api.get(`/admin/companies/${companyId}/role-modules`).then((r) => r.data),
    staleTime: 60_000,
  });

  // Local mutable state derived from server data
  const [roleEnabled, setRoleEnabled] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<ModuleOverrides>({});
  const [initialised, setInitialised] = useState(false);

  // Initialise local state once data arrives
  if (!initialised && roleConfigQ.data && roleModulesQ.data) {
    const en: Record<string, boolean> = {};
    for (const rc of roleConfigQ.data) en[rc.role_code] = rc.is_enabled;
    setRoleEnabled(en);
    setOverrides(roleModulesQ.data.overrides ?? {});
    const fees: Record<string, string> = {};
    for (const rc of roleConfigQ.data) fees[rc.role_code] = String(rc.monthly_fee ?? 0);
    setFeeEdits(fees);
    setInitialised(true);
  }

  const saveRoleConfig = useMutation({
    mutationFn: () => {
      const body = ALL_ROLES.map((r) => ({
        role_code: r.code,
        is_enabled: r.protected ? true : (roleEnabled[r.code] ?? true),
        monthly_fee: parseFloat(feeEdits[r.code] ?? "0") || 0,
      }));
      return api.post(`/admin/companies/${companyId}/role-config`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-role-config", companyId] });
      toast.success("Role config saved");
    },
    onError: () => toast.error("Failed to save role config"),
  });

  const saveModuleOverrides = useMutation({
    mutationFn: () => api.post(`/admin/companies/${companyId}/role-modules`, overrides),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-role-modules", companyId] });
      setDirty(false);
      toast.success("Module access saved");
    },
    onError: () => toast.error("Failed to save module access"),
  });

  function toggleModule(roleCode: string, moduleKey: string) {
    setOverrides((prev) => {
      const cur = prev[roleCode]?.[moduleKey];
      // cycle: undefined (default) → false → true → undefined
      const next = { ...prev };
      if (!next[roleCode]) next[roleCode] = {};
      if (cur === undefined) {
        next[roleCode][moduleKey] = false;
      } else if (!cur) {
        next[roleCode][moduleKey] = true;
      } else {
        delete next[roleCode][moduleKey];
        if (Object.keys(next[roleCode]).length === 0) delete next[roleCode];
      }
      return next;
    });
    setDirty(true);
  }

  function getCellState(roleCode: string, moduleKey: string): "default" | "denied" | "granted" {
    const v = overrides[roleCode]?.[moduleKey];
    if (v === undefined) return "default";
    return v ? "granted" : "denied";
  }

  const isLoading = roleConfigQ.isLoading || roleModulesQ.isLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="size-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Role enable/disable + fee ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Role Availability & Fees</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enable or disable roles for this company. Set a monthly fee per role (₹0 = included in
              plan).
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => saveRoleConfig.mutate()}
            disabled={saveRoleConfig.isPending}
            className="shrink-0"
          >
            {saveRoleConfig.isPending ? (
              <span className="size-3.5 border border-white border-t-transparent rounded-full animate-spin mr-1.5 inline-block" />
            ) : null}
            Save Roles
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_ROLES.map((role) => (
              <div
                key={role.code}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  role.protected
                    ? "border-[#e2e8f0] bg-[#f8fafc] opacity-70"
                    : (roleEnabled[role.code] ?? true)
                      ? "border-green-200 bg-green-50/50"
                      : "border-red-200 bg-red-50/50"
                }`}
              >
                <button
                  disabled={role.protected}
                  onClick={() => {
                    if (!role.protected) {
                      setRoleEnabled((p) => ({ ...p, [role.code]: !(p[role.code] ?? true) }));
                    }
                  }}
                  className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${
                    role.protected || (roleEnabled[role.code] ?? true)
                      ? "bg-green-500"
                      : "bg-gray-300"
                  } ${role.protected ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span
                    className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${
                      role.protected || (roleEnabled[role.code] ?? true)
                        ? "translate-x-4"
                        : "translate-x-0.5"
                    }`}
                  />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#0f172a] truncate">{role.label}</p>
                  {role.protected && <p className="text-[10px] text-[#94a3b8]">Always enabled</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-[#94a3b8]">₹</span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={feeEdits[role.code] ?? "0"}
                    onChange={(e) => setFeeEdits((p) => ({ ...p, [role.code]: e.target.value }))}
                    className="w-16 h-6 text-[12px] font-mono text-right rounded border border-[#d1d5db] px-1.5 focus:outline-none focus:border-blue-400"
                  />
                  <span className="text-[10px] text-[#94a3b8]">/mo</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Role × Module matrix ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-sm font-semibold">Module Access Overrides</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Click a cell to override module access for a role.{" "}
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-3 rounded-sm bg-gray-100 border border-gray-300" />{" "}
                default
                <span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300 ml-2" />{" "}
                denied
                <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-400 ml-2" />{" "}
                granted
              </span>
            </p>
          </div>
          {dirty && (
            <Button
              size="sm"
              onClick={() => saveModuleOverrides.mutate()}
              disabled={saveModuleOverrides.isPending}
              className="shrink-0"
            >
              {saveModuleOverrides.isPending ? (
                <span className="size-3.5 border border-white border-t-transparent rounded-full animate-spin mr-1.5 inline-block" />
              ) : null}
              Save Overrides
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#f8fafc]">
                  <th className="text-left px-3 py-2 font-semibold text-[#475569] border-b border-r border-[#e2e8f0] sticky left-0 bg-[#f8fafc] min-w-[140px]">
                    Role
                  </th>
                  {ALL_MODULES.map((m) => (
                    <th
                      key={m.key}
                      className="px-2 py-2 font-semibold text-[#475569] border-b border-r border-[#e2e8f0] text-center min-w-[72px]"
                    >
                      <span className="block truncate max-w-[68px]">{m.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALL_ROLES.map((role) => {
                  const isDisabled = !(roleEnabled[role.code] ?? true) && !role.protected;
                  return (
                    <tr
                      key={role.code}
                      className={`border-b border-[#f1f5f9] hover:bg-[#fafafa] ${isDisabled ? "opacity-40" : ""}`}
                    >
                      <td className="px-3 py-2 font-medium text-[#0f172a] border-r border-[#e2e8f0] sticky left-0 bg-white whitespace-nowrap">
                        {role.label}
                        {role.protected && (
                          <span className="ml-1 text-[9px] text-[#94a3b8] uppercase">core</span>
                        )}
                      </td>
                      {ALL_MODULES.map((m) => {
                        const state = getCellState(role.code, m.key);
                        return (
                          <td
                            key={m.key}
                            className="px-1 py-1 border-r border-[#f1f5f9] text-center"
                          >
                            <button
                              disabled={isDisabled}
                              onClick={() => !isDisabled && toggleModule(role.code, m.key)}
                              title={`${role.label} → ${m.label}: ${state}`}
                              className={`w-8 h-6 rounded text-[10px] font-bold transition-all ${
                                state === "denied"
                                  ? "bg-red-100 text-red-600 border border-red-300 hover:bg-red-200"
                                  : state === "granted"
                                    ? "bg-green-100 text-green-700 border border-green-400 hover:bg-green-200"
                                    : "bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200"
                              } ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}
                            >
                              {state === "denied" ? "✕" : state === "granted" ? "✓" : "·"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-[#e2e8f0] bg-[#f8fafc] text-[11px] text-[#64748b]">
            Overrides only appear for cells you've explicitly changed. Cells showing "·" use the
            system default for that role.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

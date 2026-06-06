import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft, Ban, CheckCircle,
  Building2, Users, Blocks, CreditCard,
  ClipboardList, Activity, Shield, Zap,
  DollarSign, BarChart3, ExternalLink,
  Download, Receipt, Store, UserPlus,
  RefreshCw, AlertTriangle,
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
          <circle cx="18" cy="18" r="16" fill="none" stroke={score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"} strokeWidth="3" strokeDasharray={`${score * 1.005} 100`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{score}</span>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Health Score</p>
        <p className="font-semibold text-sm">{label}</p>
      </div>
    </div>
  );
}

function UsageBar({ used, limit, label, icon: Icon, color }: { used: number; limit: number; label: string; icon: any; color: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const barColor = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : color;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{label}</span>
        </div>
        <span className="font-medium">{used} <span className="text-muted-foreground font-normal">/ {limit}</span></span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState("overview");

  const { data: company, isLoading } = useQuery({
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
      toast.error(err?.response?.data?.message ?? err?.response?.data?.detail ?? "Failed to suspend");
    }
  };

  const handleReactivate = async () => {
    try {
      await api.post(`/admin/companies/${companyId}/reactivate`);
      toast.success("Company reactivated. Mills and users restored.");
      qc.invalidateQueries({ queryKey: ["company-detail"] });
      qc.invalidateQueries({ queryKey: ["masters"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.response?.data?.detail ?? "Failed to reactivate");
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

  if (!company) {
    return (
      <div className="p-6">
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="size-12 text-muted-foreground/40 mb-4" />
          <p className="text-lg font-medium">Company not found</p>
          <p className="text-sm text-muted-foreground mt-1">The company you are looking for does not exist or has been removed.</p>
          <Link to="/admin/companies" className="text-sm text-blue-600 hover:underline mt-4 inline-flex items-center gap-1">
            <ArrowLeft className="size-3.5" /> Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  const userLimit = company.max_users || company.stats?.user_limit || 50;
  const userCount = company.stats?.user_count || 0;
  const millCount = company.stats?.mill_count || 0;
  const millLimit = company.stats?.mill_limit || company.stats?.included_mills || 5;
  const employeeCount = company.stats?.employee_count || 0;
  const employeeLimit = company.stats?.employee_limit || company.max_employees || 500;
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
        <Link to="/admin" className="hover:text-foreground">Admin</Link>
        <span>/</span>
        <Link to="/admin/companies" className="hover:text-foreground">Companies</Link>
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
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              Code: {company.code}
              {company.gstin && <> &middot; GST: {company.gstin}</>}
              {company.created_at && <> &middot; Since {new Date(company.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</>}
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
        <CardHeader><CardTitle className="text-base">Usage Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <UsageBar used={userCount} limit={userLimit} label="Users" icon={Users} color="bg-blue-500" />
          <UsageBar used={millCount} limit={Math.max(millLimit, 1)} label="Mills" icon={Store} color="bg-indigo-500" />
          <UsageBar used={employeeCount} limit={Math.max(employeeLimit, 1)} label="Employees" icon={Users} color="bg-violet-500" />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "View Billing", icon: Receipt, onClick: () => setTab("billing"), color: "text-blue-600 bg-blue-50" },
          { label: "Add Mill", icon: Store, onClick: () => setTab("mills"), color: "text-indigo-600 bg-indigo-50" },
          { label: "Manage Users", icon: UserPlus, onClick: () => setTab("users"), color: "text-green-600 bg-green-50" },
          { label: "View Modules", icon: Blocks, onClick: () => setTab("modules"), color: "text-purple-600 bg-purple-50" },
        ].map((action) => (
          <button key={action.label} onClick={action.onClick} className={`flex items-center gap-2 px-4 py-3 rounded-lg ${action.color} hover:opacity-80 transition-opacity text-sm font-medium`}>
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
            <p className="text-2xl font-bold">{millCount}<span className="text-sm font-normal text-muted-foreground"> / {millLimit}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{userCount}<span className="text-sm font-normal text-muted-foreground"> / {userLimit}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules</CardTitle>
            <Blocks className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{modCount}<span className="text-sm font-normal text-muted-foreground"> / {modTotal}</span></p>
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
                    <span className={f.ok ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>{f.ok ? `${usedStr(f)}` : "Exceeded"}</span>
                    {f.ok ? <CheckCircle className="size-3.5 text-emerald-500" /> : <AlertTriangle className="size-3.5 text-red-500" />}
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
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium capitalize">{company.status}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium capitalize">{company.plan}</span></div>
            {company.subscription && (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Billing Cycle</span><span className="font-medium capitalize">{company.subscription.billing_cycle}</span></div>
                {company.subscription.expires_at && <div className="flex justify-between"><span className="text-muted-foreground">Renewal</span><span className="font-medium">{new Date(company.subscription.expires_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>}
                {company.subscription.overdue_status === "overdue" && <div className="flex justify-between text-amber-600"><span className="text-amber-600">Payment Status</span><span className="font-medium">Overdue</span></div>}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="mills">Mills ({millCount})</TabsTrigger>
            <TabsTrigger value="users">Users ({userCount})</TabsTrigger>
            <TabsTrigger value="modules">Modules ({modCount})</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">Name</span><p className="font-medium">{company.name}</p></div>
              <div><span className="text-muted-foreground">Code</span><p className="font-medium">{company.code}</p></div>
              <div><span className="text-muted-foreground">GSTIN</span><p className="font-medium">{company.gstin || "—"}</p></div>
              <div><span className="text-muted-foreground">Phone</span><p className="font-medium">{company.phone || "—"}</p></div>
              <div><span className="text-muted-foreground">Email</span><p className="font-medium">{company.email || "—"}</p></div>
              <div><span className="text-muted-foreground">Address</span><p className="font-medium">{company.address || "—"}</p></div>
              <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{company.status}</p></div>
              <div><span className="text-muted-foreground">Plan</span><p className="font-medium capitalize">{company.plan}</p></div>
            </CardContent>
          </Card>

          {company.recent_audit && company.recent_audit.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Events</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-0">
                  {company.recent_audit.slice(0, 10).map((entry: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-3 border-b last:border-0">
                      <div className="size-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <ClipboardList className="size-4 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm capitalize">{entry.action?.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.details}</p>
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="mills">
          <MillsTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="users">
          <UsersTab companyId={companyId} company={company} />
        </TabsContent>

        <TabsContent value="modules">
          <ModulesTab companyId={companyId} />
        </TabsContent>

        <TabsContent value="billing">
          <BillingTab companyId={companyId} company={company} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab companyId={companyId} />
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
  const { data: mills } = useQuery({
    queryKey: ["mills", companyId],
    queryFn: () => mastersApi.getMills(1, 100, undefined, companyId).then((r: any) => r.data ?? []),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mills</CardTitle>
      </CardHeader>
      <CardContent>
        {(!mills || mills.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No mills found</p>
            <p className="text-xs text-muted-foreground mt-1">This company has no mills configured yet.</p>
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
                </tr>
              </thead>
              <tbody>
                {mills.map((m: any) => (
                  <tr key={m.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.code}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{m.city || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{m.state || "—"}</td>
                    <td className="px-4 py-2">
                      <Badge className={m.is_active !== false ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
                        {m.is_active !== false ? "Active" : "Suspended"}
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

/* ── Users Tab ────────────────────────────────────────── */

function UsersTab({ companyId, company }: { companyId: string; company: any }) {
  const { data: users } = useQuery({
    queryKey: ["company-users", companyId],
    queryFn: () => api.get(`/admin/users?company_id=${companyId}&page_size=500`).then((r: any) => r.data?.data ?? r.data ?? []),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Users ({company.stats?.user_count ?? 0} / {company.max_users})</CardTitle>
      </CardHeader>
      <CardContent>
        {(!users || users.length === 0) ? (
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
                    <td className="px-4 py-2 text-muted-foreground hidden md:table-cell">{u.role ?? u.role_code}</td>
                    <td className="px-4 py-2">
                      <Badge className={u.is_active !== false ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}>
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
      <CardHeader><CardTitle>Modules</CardTitle></CardHeader>
      <CardContent>
        {modList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Blocks className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No modules configured</p>
            <p className="text-xs text-muted-foreground mt-1">This company has no modules enabled.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {modList.map(([name, enabled]) => (
              <div key={name} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                enabled ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-400"
              }`}>
                <div className={`size-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
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
        <CardHeader><CardTitle>Billing & Subscription</CardTitle></CardHeader>
        <CardContent>
          {!billing ? (
            <div className="flex items-center justify-center py-8">
              <div className="size-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">Plan</span><p className="font-medium capitalize">{billing.plan_name ?? billing.plan_code}</p></div>
              <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{billing.status}</p></div>
              <div><span className="text-muted-foreground">Billing Cycle</span><p className="font-medium capitalize">{billing.billing_cycle}</p></div>
              <div><span className="text-muted-foreground">Users</span><p className="font-medium">{billing.user_count ?? 0} / {billing.user_limit ?? 0}</p></div>
              {billing.cost && (
                <>
                  <div><span className="text-muted-foreground">Monthly</span><p className="font-medium">₹{(billing.cost.total_monthly ?? 0).toLocaleString("en-IN")}</p></div>
                  <div><span className="text-muted-foreground">Yearly</span><p className="font-medium">₹{(billing.cost.total_yearly ?? 0).toLocaleString("en-IN")}</p></div>
                </>
              )}
              <div><span className="text-muted-foreground">Mills</span><p className="font-medium">{billing.mill_count ?? 0} / {billing.mill_limit ?? 0}</p></div>
            </div>
          )}
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => window.open(`/admin/billing?company=${companyId}`, "_self")}>
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
    queryFn: () => api.get(`/audit/logs?entity_id=${companyId}&page_size=50`).then((r: any) => r.data?.data ?? []),
  });

  const entries = Array.isArray(audit) ? audit : [];

  return (
    <Card>
      <CardHeader><CardTitle>Audit Log</CardTitle></CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ClipboardList className="size-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">No audit entries</p>
            <p className="text-xs text-muted-foreground mt-1">No activity has been logged for this company yet.</p>
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
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate hidden md:table-cell">{e.details}</td>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
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

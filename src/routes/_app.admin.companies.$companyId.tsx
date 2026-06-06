import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <p className="text-muted-foreground">Company not found.</p>
        <Link to="/admin/companies" className="text-sm text-blue-600 hover:underline mt-2 inline-block">
          ← Back to Companies
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            to="/admin/companies"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="size-3.5" /> Back to Companies
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{company.name}</h1>
            <Badge className={STATUS_BADGE[company.status] ?? ""}>
              {company.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Code: {company.code}
            {company.gstin && <> &middot; GST: {company.gstin}</>}
            {company.created_at && <> &middot; Since {new Date(company.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Mills</CardTitle>
            <Building2 className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{company.stats?.mill_count ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {company.stats?.user_count ?? 0}
              <span className="text-sm font-normal text-muted-foreground"> / {company.max_users}</span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Modules</CardTitle>
            <Blocks className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{company.stats?.enabled_modules_count ?? 0}</p>
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mills">Mills ({company.stats?.mill_count ?? 0})</TabsTrigger>
          <TabsTrigger value="users">Users ({company.stats?.user_count ?? 0})</TabsTrigger>
          <TabsTrigger value="modules">Modules ({company.stats?.enabled_modules_count ?? 0})</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Company Information</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
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

          {company.subscription && (
            <Card>
              <CardHeader><CardTitle>Subscription</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-muted-foreground">Plan</span><p className="font-medium capitalize">{company.subscription.plan_name ?? company.subscription.plan_code}</p></div>
                <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{company.subscription.status}</p></div>
                <div><span className="text-muted-foreground">Billing Cycle</span><p className="font-medium capitalize">{company.subscription.billing_cycle}</p></div>
              </CardContent>
            </Card>
          )}

          {company.recent_audit && company.recent_audit.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {company.recent_audit.slice(0, 10).map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <ClipboardList className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium">{entry.action}</p>
                      <p className="text-muted-foreground text-xs">
                        {entry.details} &middot; {entry.user_name} &middot; {entry.created_at ? new Date(entry.created_at).toLocaleString("en-IN") : ""}
                      </p>
                    </div>
                  </div>
                ))}
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
          <p className="text-sm text-muted-foreground">No mills found for this company.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Code</th>
                  <th className="text-left px-4 py-2 font-medium">City</th>
                  <th className="text-left px-4 py-2 font-medium">State</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mills.map((m: any) => (
                  <tr key={m.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{m.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.code}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.city || "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{m.state || "—"}</td>
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
          <p className="text-sm text-muted-foreground">No users found for this company.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">Role</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(Array.isArray(users) ? users : []).map((u: any) => (
                  <tr key={u.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{u.full_name ?? u.name}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-2 text-muted-foreground">{u.role ?? u.role_code}</td>
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
          <p className="text-sm text-muted-foreground">No modules found.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {modList.map(([name, enabled]) => (
              <div
                key={name}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${
                  enabled ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-400"
                }`}
              >
                <div className={`size-2 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-300"}`} />
                <span className="capitalize">{name.replace(/_/g, " ")}</span>
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
    <Card>
      <CardHeader><CardTitle>Billing & Subscription</CardTitle></CardHeader>
      <CardContent>
        {!billing ? (
          <p className="text-sm text-muted-foreground">Loading billing info...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Plan</span><p className="font-medium capitalize">{billing.plan_name ?? billing.plan_code}</p></div>
            <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{billing.status}</p></div>
            <div><span className="text-muted-foreground">Billing Cycle</span><p className="font-medium capitalize">{billing.billing_cycle}</p></div>
            {billing.cost && (
              <>
                <div><span className="text-muted-foreground">Monthly</span><p className="font-medium">₹{billing.cost.total_monthly?.toLocaleString("en-IN")}</p></div>
                <div><span className="text-muted-foreground">Yearly</span><p className="font-medium">₹{billing.cost.total_yearly?.toLocaleString("en-IN")}</p></div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
          <p className="text-sm text-muted-foreground">No audit entries found.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Action</th>
                  <th className="text-left px-4 py-2 font-medium">User</th>
                  <th className="text-left px-4 py-2 font-medium">Details</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{e.action}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.user_name}</td>
                    <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{e.details}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {e.created_at ? new Date(e.created_at).toLocaleString("en-IN") : "—"}
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

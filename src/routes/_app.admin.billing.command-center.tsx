import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { KpiCard } from "@/components/ui/KpiCard";
import { useState } from "react";
import {
  CreditCard, DollarSign, TrendingUp, Users, Factory,
  Server, Activity, Receipt, Download, ArrowUpDown,
  Loader2, AlertTriangle, Building2, BarChart3,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/admin/billing/command-center")({
  head: () => ({ meta: [{ title: "Billing Command Center — Admin — SpinFlow ERP" }] }),
  component: BillingCommandCenter,
});

function UsageBar({ label, used, limit, unit }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 85 ? "bg-amber-400" : "bg-blue-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used?.toLocaleString() ?? "—"}/{limit?.toLocaleString() ?? "—"} {unit && <span className="text-muted-foreground">{unit}</span>}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BillingCommandCenter() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string>("");

  const dashboardQ = useQuery({
    queryKey: ["admin-billing-dashboard"],
    queryFn: () => api.get("/admin/billing/dashboard").then(r => r.data),
    staleTime: 30_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () => api.get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } }).then(r => r.data),
    staleTime: 30_000,
  });

  const analyticsQ = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 60_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const dd = dashboardQ.data;
  const subs: any[] = Array.isArray(subsQ.data?.items) ? subsQ.data.items : [];
  const selectedSub = companyId ? subs.find((s: any) => s.company_id === companyId) : null;

  const isLoading = dashboardQ.isLoading || subsQ.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing Command Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Centralized billing oversight — plans, usage, invoices, and actions</p>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {isLoading ? Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="h-3 w-14 bg-muted rounded animate-pulse mb-2" /><div className="h-6 w-20 bg-muted rounded animate-pulse" /></CardContent></Card>
        )) : (
          <>
            <KpiCard label="MRR" value={`₹${((dd?.mrr ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} subLabel="Monthly recurring" icon={TrendingUp} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <KpiCard label="ARR" value={`₹${((dd?.arr ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} subLabel="Annual recurring" icon={DollarSign} iconColor="text-green-600" iconBg="bg-green-50" />
            <KpiCard label="Active Subs" value={String(dd?.active_subscriptions ?? 0)} subLabel="Active" icon={Building2} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
            <KpiCard label="Collection Rate" value={dd ? `${(dd.collection_rate ?? 0).toFixed(0)}%` : "—"} subLabel="Overall" icon={Activity} iconColor="text-purple-600" iconBg="bg-purple-50" />
            <KpiCard label="Overdue" value={String(dd?.overdue_companies ?? 0)} subLabel="Accounts overdue" icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
            <KpiCard label="Renewals Due" value={String(subs.filter((s: any) => s.renewal_date && new Date(s.renewal_date).getTime() - Date.now() < 14 * 86400000 && new Date(s.renewal_date).getTime() > Date.now()).length)} subLabel="Due within 14 days" icon={CreditCard} iconColor="text-amber-600" iconBg="bg-amber-50" />
          </>
        )}
      </div>

      {/* Company selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <label className="text-sm font-medium flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" /> Company</label>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="flex-1 max-w-md rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
              <option value="">All companies (aggregate view)</option>
              {subs.map((s: any) => (
                <option key={s.company_id} value={s.company_id}>{s.company_name}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Company Detail View */}
      {selectedSub && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Plan Card */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><CreditCard className="size-4" /> Current Plan</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold capitalize">{selectedSub.plan_name ?? selectedSub.subscription_plan ?? "N/A"}</p>
                  <StatusBadge status={selectedSub.status ?? "active"} />
                </div>
                <Badge variant="outline" className="text-xs">
                  Renews {selectedSub.renewal_date ? new Date(selectedSub.renewal_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "N/A"}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{selectedSub.status ?? "active"}</p></div>
                <div><span className="text-muted-foreground">Grace Period</span><p className="font-medium">{selectedSub.grace_period_days ?? 0} days</p></div>
                <div><span className="text-muted-foreground">Trial Ends</span><p className="font-medium">{selectedSub.trial_ends_at ? new Date(selectedSub.trial_ends_at).toLocaleDateString("en-IN") : "N/A"}</p></div>
                <div><span className="text-muted-foreground">Billing Cycle</span><p className="font-medium capitalize">{selectedSub.billing_cycle ?? "monthly"}</p></div>
              </div>
            </CardContent>
          </Card>

          {/* Usage Card */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="size-4" /> Usage</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <UsageBar label="Users" used={selectedSub.user_count ?? 0} limit={selectedSub.user_limit ?? 1} />
              <UsageBar label="Mills" used={selectedSub.mill_count ?? 0} limit={selectedSub.mill_limit ?? 1} />
              <UsageBar label="Employees" used={selectedSub.employee_count ?? 0} limit={selectedSub.employee_limit ?? 9999} />
            </CardContent>
          </Card>

          {/* Actions & Invoices */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><ArrowUpDown className="size-4" /> Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate({ to: `/admin/companies/${selectedSub.company_id}` })}>
                <Building2 className="size-3.5 mr-2" /> View Company Detail
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate({ to: "/admin/billing/plans" })}>
                <TrendingUp className="size-3.5 mr-2" /> Upgrade / Downgrade Plan
              </Button>
              <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => navigate({ to: "/admin/billing/invoices" })}>
                <Receipt className="size-3.5 mr-2" /> View Invoices
              </Button>
            </CardContent>
          </Card>

          {/* Extra info */}
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="size-4" /> Additional Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Extra Users</span><span>{selectedSub.extra_users ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Extra Mills</span><span>{selectedSub.extra_mills ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Extra Employees</span><span>{selectedSub.extra_employees ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Overage Cost</span><span>₹{((selectedSub.additional_user_cost ?? 0) + (selectedSub.additional_mill_cost ?? 0) + (selectedSub.additional_employee_cost ?? 0)).toLocaleString("en-IN")}</span></div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* All subscriptions table */}
      {!selectedSub && (
        <Card>
          <CardHeader><CardTitle className="text-sm">All Subscriptions ({subs.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Company</th>
                    <th className="text-left px-4 py-2.5 font-semibold text-xs text-muted-foreground">Plan</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground">Status</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground">Users</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground">Mills</th>
                    <th className="text-center px-4 py-2.5 font-semibold text-xs text-muted-foreground">Renewal</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-xs text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.slice(0, 20).map((s: any) => (
                    <tr key={s.company_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.company_name}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{s.plan_name ?? s.subscription_plan ?? "—"}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={s.status ?? "active"} /></td>
                      <td className="px-4 py-3 text-center">{s.user_count ?? 0}/{s.user_limit ?? 0}</td>
                      <td className="px-4 py-3 text-center">{s.mill_count ?? 0}/{s.mill_limit ?? 0}</td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        {s.renewal_date ? new Date(s.renewal_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setCompanyId(s.company_id)} className="text-xs text-blue-600 hover:underline">View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {subs.length > 20 && (
              <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-gray-100">
                Showing 20 of {subs.length} subscriptions. <button onClick={() => navigate({ to: "/admin/billing/subscriptions" })} className="text-blue-600 hover:underline">View all</button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

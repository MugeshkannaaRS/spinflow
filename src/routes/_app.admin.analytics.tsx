import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import {
  TrendingUp, DollarSign, Users, Activity, BarChart3,
  Building2, CreditCard, HeartHandshake, Lightbulb,
  Crown, Loader2, AlertTriangle, ArrowUpRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/analytics")({
  head: () => ({ meta: [{ title: "Analytics Center — Admin — SpinFlow ERP" }] }),
  component: AnalyticsCenterPage,
});

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    starter: "bg-gray-100 text-gray-700", growth: "bg-blue-100 text-blue-700",
    business: "bg-purple-100 text-purple-700", enterprise: "bg-amber-100 text-amber-700",
    custom: "bg-green-100 text-green-700",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${colors[plan?.toLowerCase()] ?? "bg-gray-100 text-gray-700"}`}>{plan ?? "N/A"}</span>;
}

function AnalyticsCenterPage() {
  const user = useAuth((s) => s.user);
  const [timeRange, setTimeRange] = useState("monthly");

  const analyticsQ = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 60_000,
  });

  const companyGrowthQ = useQuery({
    queryKey: ["admin-analytics-growth", timeRange],
    queryFn: () => adminApi.getCompanyGrowth({ period: timeRange }),
    staleTime: 60_000,
  });

  const moduleAdoptionQ = useQuery({
    queryKey: ["admin-analytics-modules"],
    queryFn: () => adminApi.getModuleAdoption(),
    staleTime: 120_000,
  });

  const retentionQ = useQuery({
    queryKey: ["admin-analytics-retention"],
    queryFn: () => adminApi.getRetentionCohort(),
    staleTime: 120_000,
  });

  const mrrBreakdownQ = useQuery({
    queryKey: ["admin-analytics-mrr"],
    queryFn: () => adminApi.getMrrBreakdown(),
    staleTime: 60_000,
  });

  const dashboardQ = useQuery({
    queryKey: ["admin-billing-dashboard"],
    queryFn: () => api.get("/admin/billing/dashboard").then(r => r.data),
    staleTime: 60_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () => api.get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } }).then(r => r.data),
    staleTime: 60_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const an = analyticsQ.data;
  const growth: any[] = Array.isArray(companyGrowthQ.data?.data ?? companyGrowthQ.data) ? (companyGrowthQ.data?.data ?? companyGrowthQ.data) : [];
  const adoption: any[] = Array.isArray(moduleAdoptionQ.data?.data ?? moduleAdoptionQ.data) ? (moduleAdoptionQ.data?.data ?? moduleAdoptionQ.data) : [];
  const retention: any[] = Array.isArray(retentionQ.data?.data ?? retentionQ.data) ? (retentionQ.data?.data ?? retentionQ.data) : [];
  const mrrBreakdown = mrrBreakdownQ.data;
  const dd = dashboardQ.data;
  const subsList: any[] = Array.isArray(subsQ.data?.items) ? subsQ.data.items : [];

  const planDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const s of subsList) {
      const plan = (s.subscription_plan ?? s.plan_name ?? "unknown").toLowerCase();
      dist[plan] = (dist[plan] ?? 0) + 1;
    }
    return Object.entries(dist).sort((a, b) => b[1] - a[1]);
  }, [subsList]);

  const companyRanking = useMemo(() => {
    return [...subsList]
      .sort((a, b) => ((b.mrr ?? b.revenue ?? 0) - (a.mrr ?? a.revenue ?? 0)))
      .slice(0, 10);
  }, [subsList]);

  const customerHealth = useMemo(() => {
    const healthy = subsList.filter((s: any) => (s.user_count ?? 0) < (s.user_limit ?? 1) * 0.8 && s.status === "active").length;
    const atRisk = subsList.filter((s: any) => (s.user_count ?? 0) >= (s.user_limit ?? 1) * 0.85 || s.status === "overdue").length;
    const churned = subsList.filter((s: any) => s.status === "suspended" || s.status === "cancelled").length;
    return { healthy, atRisk, churned, total: subsList.length };
  }, [subsList]);

  const anyLoading = analyticsQ.isLoading || companyGrowthQ.isLoading || moduleAdoptionQ.isLoading || retentionQ.isLoading || mrrBreakdownQ.isLoading || dashboardQ.isLoading || subsQ.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Revenue, growth, retention, and adoption analytics</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {["monthly", "yearly"].map((t) => (
            <button key={t} onClick={() => setTimeRange(t)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-all ${
                timeRange === t ? "bg-white shadow-sm text-gray-900" : "text-muted-foreground hover:text-gray-700"
              }`}
            >{t}</button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {anyLoading && !an ? Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4"><div className="h-3 w-14 bg-muted rounded animate-pulse mb-2" /><div className="h-6 w-20 bg-muted rounded animate-pulse" /></CardContent></Card>
        )) : (
          <>
            <KpiCard label="MRR" value={an ? `₹${an.mrr?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) ?? "—"}` : "—"} subLabel="Monthly recurring" icon={TrendingUp} iconColor="text-blue-600" iconBg="bg-blue-50" />
            <KpiCard label="ARR" value={an ? `₹${an.arr?.toLocaleString("en-IN", { maximumFractionDigits: 0 }) ?? "—"}` : "—"} subLabel="Annual recurring" icon={DollarSign} iconColor="text-green-600" iconBg="bg-green-50" />
            <KpiCard label="ARPU" value={an ? `₹${(an.arpu ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }) }` : "—"} subLabel="Per user" icon={Users} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
            <KpiCard label="LTV" value={an ? `₹${(an.ltv ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—"} subLabel="Customer lifetime" icon={HeartHandshake} iconColor="text-purple-600" iconBg="bg-purple-50" />
            <KpiCard label="Churn Rate" value={an ? `${an.churn_rate ?? 0}%` : "—"} subLabel="Customer churn" icon={Activity} iconColor="text-red-600" iconBg="bg-red-50" />
            <KpiCard label="Collection" value={dd ? `${(dd.collection_rate ?? 0).toFixed(0)}%` : "—"} subLabel="Rate" icon={CreditCard} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
          </>
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Revenue Growth */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="size-4" /> Company Growth ({timeRange})</CardTitle></CardHeader>
          <CardContent>
            {companyGrowthQ.isLoading ? (
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            ) : growth.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No growth data available.</p>
            ) : (
              <div className="space-y-2">
                {growth.slice(0, 12).map((g: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-24 text-muted-foreground">{g.period ?? g.month ?? g.label}</span>
                    <div className="flex-1 h-4 rounded bg-gray-100">
                      <div className="h-4 rounded bg-blue-500" style={{ width: `${Math.min((g.count ?? g.value ?? 0) / Math.max(...growth.map((x: any) => x.count ?? x.value ?? 0), 1) * 100, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right font-medium">{g.count ?? g.value ?? 0}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Module Adoption */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="size-4" /> Module Adoption</CardTitle></CardHeader>
          <CardContent>
            {moduleAdoptionQ.isLoading ? (
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            ) : adoption.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No module adoption data.</p>
            ) : (
              <div className="space-y-2">
                {adoption.slice(0, 15).map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="w-28 text-muted-foreground capitalize truncate">{m.module ?? m.name ?? m.code}</span>
                    <div className="flex-1 h-4 rounded bg-gray-100">
                      <div className={`h-4 rounded ${(m.adoption_rate ?? m.percentage ?? 0) > 75 ? "bg-emerald-500" : (m.adoption_rate ?? 0) > 50 ? "bg-blue-500" : "bg-amber-400"}`}
                        style={{ width: `${Math.min(m.adoption_rate ?? m.percentage ?? 0, 100)}%` }} />
                    </div>
                    <span className="w-10 text-right font-medium">{m.adoption_rate ?? m.percentage ?? 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Retention Cohort */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="size-4" /> Retention Cohort</CardTitle></CardHeader>
          <CardContent>
            {retentionQ.isLoading ? (
              <div className="h-32 bg-gray-100 rounded animate-pulse" />
            ) : retention.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No retention data available.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-2 py-1.5 font-semibold text-muted-foreground">Cohort</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">Size</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">1m</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">3m</th>
                      <th className="text-center px-2 py-1.5 font-semibold text-muted-foreground">6m</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retention.slice(0, 10).map((r: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-2 py-1.5 font-medium">{r.cohort ?? r.period ?? r.month}</td>
                        <td className="px-2 py-1.5 text-center">{r.size ?? r.count ?? 0}</td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`font-medium ${(r.month_1 ?? r.retention_1m ?? 0) >= 80 ? "text-green-600" : (r.month_1 ?? 0) >= 60 ? "text-amber-600" : "text-red-600"}`}>
                            {r.month_1 ?? r.retention_1m ?? 0}%
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`font-medium ${(r.month_3 ?? r.retention_3m ?? 0) >= 70 ? "text-green-600" : "text-amber-600"}`}>
                            {r.month_3 ?? r.retention_3m ?? 0}%
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className={`font-medium ${(r.month_6 ?? r.retention_6m ?? 0) >= 60 ? "text-green-600" : "text-amber-600"}`}>
                            {r.month_6 ?? r.retention_6m ?? 0}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* MRR Breakdown */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><DollarSign className="size-4" /> MRR Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {mrrBreakdownQ.isLoading ? (
              <div className="h-24 bg-gray-100 rounded animate-pulse" />
            ) : !mrrBreakdown ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No MRR breakdown data.</p>
            ) : (
              <>
                {[
                  { label: "Subscription", value: mrrBreakdown.subscription ?? 0, color: "bg-blue-500" },
                  { label: "Overage", value: mrrBreakdown.overage ?? 0, color: "bg-amber-500" },
                  { label: "Add-on", value: mrrBreakdown.addon ?? 0, color: "bg-purple-500" },
                ].map((item) => {
                  const total = (mrrBreakdown.subscription ?? 0) + (mrrBreakdown.overage ?? 0) + (mrrBreakdown.addon ?? 0);
                  const pct = total > 0 ? (item.value / total) * 100 : 0;
                  return (
                    <div key={item.label} className="flex items-center gap-3 text-xs">
                      <span className="w-24 text-muted-foreground">{item.label}</span>
                      <div className="flex-1 h-4 rounded bg-gray-100">
                        <div className={`h-4 rounded ${item.color}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right font-medium">₹{item.value?.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                      <span className="w-10 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </>
            )}
          </CardContent>
        </Card>

        {/* Plan Distribution */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Crown className="size-4" /> Plan Distribution</CardTitle></CardHeader>
          <CardContent>
            {planDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No subscription data.</p>
            ) : (
              <div className="space-y-2">
                {planDistribution.map(([plan, count]) => {
                  const total = subsList.length;
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={plan} className="flex items-center gap-3 text-xs">
                      <PlanBadge plan={plan} />
                      <div className="flex-1 h-4 rounded bg-gray-100">
                        <div className="h-4 rounded bg-indigo-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-right font-medium">{count}</span>
                      <span className="w-10 text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Customer Health */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><HeartHandshake className="size-4" /> Customer Health</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-center gap-8 py-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-emerald-600">{customerHealth.healthy}</div>
                <p className="text-xs text-muted-foreground mt-1">Healthy</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-amber-600">{customerHealth.atRisk}</div>
                <p className="text-xs text-muted-foreground mt-1">At Risk</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">{customerHealth.churned}</div>
                <p className="text-xs text-muted-foreground mt-1">Churned</p>
              </div>
            </div>
            {customerHealth.total > 0 && (
              <div className="h-3 rounded-full bg-gray-100 flex overflow-hidden">
                <div className="bg-emerald-500 h-3" style={{ width: `${(customerHealth.healthy / customerHealth.total) * 100}%` }} />
                <div className="bg-amber-400 h-3" style={{ width: `${(customerHealth.atRisk / customerHealth.total) * 100}%` }} />
                <div className="bg-red-500 h-3" style={{ width: `${(customerHealth.churned / customerHealth.total) * 100}%` }} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Company Ranking */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="size-4" /> Company Ranking by MRR</CardTitle></CardHeader>
          <CardContent>
            {companyRanking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No data.</p>
            ) : (
              <div className="space-y-2">
                {companyRanking.map((s: any, i: number) => (
                  <div key={s.company_id} className="flex items-center gap-3 text-xs">
                    <span className="w-5 text-center font-bold text-muted-foreground">#{i + 1}</span>
                    <span className="flex-1 truncate font-medium">{s.company_name}</span>
                    <PlanBadge plan={s.subscription_plan ?? s.plan_name} />
                    <span className="w-24 text-right font-medium">₹{((s.mrr ?? s.revenue ?? 0)).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

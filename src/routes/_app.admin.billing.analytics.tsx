import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_app/admin/billing/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Billing — SpinFlow ERP" }] }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const user = useAuth((s) => s.user);

  const q = useQuery({
    queryKey: ["admin-billing-analytics"],
    queryFn: () => adminApi.getBillingAnalytics(),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  if (q.isError) {
    return (
      <div className="p-6 space-y-6">
        <div><h1 className="text-xl font-bold">Revenue Analytics</h1><p className="text-sm text-muted-foreground">MRR, ARR, churn, ARPU, LTV, and revenue trends.</p></div>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-8 text-center">
          <AlertTriangle className="size-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load analytics.</p>
          <p className="text-xs text-red-500 mt-1 mb-3">{(q.error as any)?.response?.data?.detail ?? (q.error as any)?.message ?? "Request failed"}</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div><h1 className="text-xl font-bold">Revenue Analytics</h1><p className="text-sm text-muted-foreground">MRR, ARR, churn, ARPU, LTV, and revenue trends.</p></div>
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-3 w-16 bg-muted rounded animate-pulse mb-2" /><div className="h-6 w-24 bg-muted rounded animate-pulse" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const d = q.data!;

  const metrics = [
    { label: "MRR", value: `₹${(d.mrr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "ARR", value: `₹${(d.arr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "ARPU", value: `₹${(d.arpu ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "LTV", value: `₹${(d.ltv ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` },
    { label: "Churn Rate", value: `${d.churn_rate ?? 0}%` },
  ];

  const mrrTrend = d.mrr_trend ?? [];
  const topCustomers = d.top_customers ?? [];
  const planDistribution = d.plan_distribution ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold">Revenue Analytics</h1>
        <p className="text-sm text-muted-foreground">MRR, ARR, churn, ARPU, LTV, and revenue trends.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-xl font-bold mt-1">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">MRR Trend (6 months)</CardTitle></CardHeader>
          <CardContent>
            {mrrTrend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No revenue data yet.</p>
            ) : (
              <div className="space-y-2">
                {mrrTrend.map((m: any) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">{m.month}</span>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded transition-all"
                        style={{ width: `${Math.min((m.revenue / Math.max(...mrrTrend.map((x: any) => x.revenue), 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium w-24 text-right">
                      ₹{(m.revenue ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Plan Distribution</CardTitle></CardHeader>
          <CardContent>
            {planDistribution.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No plans assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {planDistribution.map((p: any) => (
                  <div key={p.plan} className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{p.plan}</span>
                    <span className="text-sm text-muted-foreground">{p.count} companies</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Top Customers by Revenue</CardTitle></CardHeader>
        <CardContent>
          {topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No payment data yet.</p>
          ) : (
            <div className="divide-y">
              {topCustomers.map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium">{c.company_name}</span>
                  <span className="text-sm font-medium">
                    ₹{(c.total_paid ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

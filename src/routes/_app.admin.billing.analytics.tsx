import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  const d = q.data;

  const metrics = [
    { label: "MRR", value: d ? `₹${(d.mrr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—" },
    { label: "ARR", value: d ? `₹${(d.arr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—" },
    { label: "ARPU", value: d ? `₹${(d.arpu ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—" },
    { label: "LTV", value: d ? `₹${(d.ltv ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—" },
    { label: "Churn Rate", value: d ? `${d.churn_rate ?? 0}%` : "—" },
  ];

  const mrrTrend = d?.mrr_trend ?? [];
  const topCustomers = d?.top_customers ?? [];
  const planDistribution = d?.plan_distribution ?? [];

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

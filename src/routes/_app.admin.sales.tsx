import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/KpiCard";
import {
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  BarChart3,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/sales")({
  head: () => ({ meta: [{ title: "Sales Command Center — SpinFlow ERP" }] }),
  component: SalesCommandCenter,
});

interface FunnelStage {
  stage: string;
  count: number;
  dropoff: number;
}

function SalesCommandCenter() {
  const { data: overview, isLoading } = useQuery({
    queryKey: ["sales-overview"],
    queryFn: () => api.get("/admin/sales/overview").then((r) => r.data ?? {}),
    staleTime: 60_000,
  });

  const { data: funnel } = useQuery({
    queryKey: ["sales-funnel"],
    queryFn: () => api.get("/admin/sales/funnel").then((r) => r.data ?? {}),
    staleTime: 60_000,
  });

  const t = overview?.trials ?? {};
  const c = overview?.conversion ?? {};
  const h = overview?.health ?? {};
  const funnelStages: FunnelStage[] = funnel?.funnel ?? [];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sales Command Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Trial tracking, conversion analytics, and customer health
        </p>
      </div>

      {/* Trial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Active Trials"
          value={isLoading ? "—" : (t.active ?? 0)}
          icon={Clock}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="Started (30d)"
          value={isLoading ? "—" : (t.started_30d ?? 0)}
          icon={TrendingUp}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <KpiCard
          label="Expired"
          value={isLoading ? "—" : (t.expired ?? 0)}
          icon={AlertTriangle}
          iconColor="text-red-600"
          iconBg="bg-red-50"
        />
        <KpiCard
          label="Total Trials"
          value={isLoading ? "—" : (t.total ?? 0)}
          icon={Users}
          iconColor="text-indigo-600"
          iconBg="bg-indigo-50"
        />
      </div>

      {/* Conversion KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Companies"
          value={isLoading ? "—" : (c.total_companies ?? 0)}
          icon={BarChart3}
          iconColor="text-gray-600"
          iconBg="bg-gray-50"
        />
        <KpiCard
          label="Paying Customers"
          value={isLoading ? "—" : (c.active_subscriptions ?? 0)}
          icon={CheckCircle2}
          iconColor="text-green-600"
          iconBg="bg-green-50"
        />
        <KpiCard
          label="Conversion Rate"
          value={isLoading ? "—" : `${c.conversion_rate ?? 0}%`}
          icon={TrendingUp}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
        />
        <KpiCard
          label="MRR"
          value={isLoading ? "—" : `₹${(c.mrr ?? 0).toLocaleString()}`}
          icon={DollarSign}
          iconColor="text-teal-600"
          iconBg="bg-teal-50"
        />
      </div>

      {/* Customer Health Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Customer Health Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Healthy", count: h.healthy ?? 0, color: "bg-green-500" },
              { label: "Warning", count: h.warning ?? 0, color: "bg-amber-500" },
              { label: "At Risk", count: h.at_risk ?? 0, color: "bg-orange-500" },
              { label: "Critical", count: h.critical ?? 0, color: "bg-red-500" },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-lg bg-gray-50">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                  <span className="text-xs text-muted-foreground">{item.label}</span>
                </div>
                <p className="text-lg font-bold text-gray-900">{item.count}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Conversion Funnel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelStages.map((stage, i) => {
              const maxCount = funnelStages[0]?.count || 1;
              const width = (stage.count / maxCount) * 100;
              return (
                <div key={stage.stage}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{stage.stage}</span>
                    <span className="text-muted-foreground">{stage.count} companies</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${i === funnelStages.length - 1 ? "bg-green-500" : "bg-blue-500"}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

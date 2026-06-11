import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Factory, AlertTriangle, CheckCircle2, DollarSign, Users, TrendingUp, Package, BadgeCheck, Clock, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/executive-dashboard")({
  head: () => ({ meta: [{ title: "Executive Dashboard — SpinFlow ERP" }] }),
  component: ExecutiveDashboard,
});

function ExecutiveDashboard() {
  const { data: kpi, isLoading } = useQuery({
    queryKey: ["exec-dashboard"],
    queryFn: () => api.get("/dashboard/kpis").then((r) => r.data ?? {}),
    staleTime: 30_000,
  });

  const { data: alerts } = useQuery({
    queryKey: ["alerts-ops-center"],
    queryFn: () => api.get("/alerts/ops-center").then((r) => r.data ?? {}),
    staleTime: 30_000,
  });

  const { data: eng } = useQuery({
    queryKey: ["engagement"],
    queryFn: () => api.get("/customer/engagement").then((r) => r.data ?? {}),
    staleTime: 60_000,
  });

  const todayProd = kpi?.today_production ?? 0;
  const efficiency = kpi?.today_efficiency ?? 0;
  const waste = kpi?.today_waste ?? 0;
  const activeMachines = kpi?.active_machines ?? 0;
  const qualityPass = kpi?.quality_pass_rate ?? 0;
  const openAlerts = (alerts?.open_count ?? 0) + (alerts?.escalated_count ?? 0);
  const healthScore = eng?.score ?? 0;

  return (
    <div className="px-3 sm:px-6 lg:px-8 py-4 lg:py-6 max-w-6xl mx-auto space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg lg:text-xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-xs lg:text-sm text-muted-foreground">Your mill at a glance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Activity className="w-3.5 h-3.5" />
          Health Score: <span className={healthScore >= 70 ? "text-green-600 font-bold" : healthScore >= 50 ? "text-amber-600 font-bold" : "text-red-600 font-bold"}>{healthScore}/100</span>
        </div>
      </div>

      {/* KPI row — 3 cols mobile, 6 cols desktop */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2 lg:gap-4">
        <KpiCard label="Today Production" value={isLoading ? "—" : `${todayProd} kg`} icon={Factory} iconColor="text-blue-600" iconBg="bg-blue-50" />
        <KpiCard label="Efficiency" value={isLoading ? "—" : `${efficiency}%`} icon={TrendingUp} iconColor="text-green-600" iconBg="bg-green-50" />
        <KpiCard label="Waste %" value={isLoading ? "—" : `${waste}%`} icon={AlertTriangle} iconColor="text-amber-600" iconBg="bg-amber-50" />
        <KpiCard label="Active Machines" value={isLoading ? "—" : activeMachines} icon={Activity} iconColor="text-indigo-600" iconBg="bg-indigo-50" />
        <KpiCard label="Quality Pass" value={isLoading ? "—" : `${qualityPass}%`} icon={BadgeCheck} iconColor="text-teal-600" iconBg="bg-teal-50" />
        <KpiCard label="Open Alerts" value={isLoading ? "—" : openAlerts} icon={AlertTriangle} iconColor="text-red-600" iconBg="bg-red-50" />
      </div>

      {/* Quick action cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <a href="/production" className="block">
          <Card className="hover:shadow-sm transition-shadow h-full">
            <CardContent className="p-3 lg:p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Factory className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Production</p>
                <p className="text-[10px] text-muted-foreground">Record & track output</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/quality" className="block">
          <Card className="hover:shadow-sm transition-shadow h-full">
            <CardContent className="p-3 lg:p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <BadgeCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Quality</p>
                <p className="text-[10px] text-muted-foreground">Tests & approvals</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/inventory" className="block">
          <Card className="hover:shadow-sm transition-shadow h-full">
            <CardContent className="p-3 lg:p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Inventory</p>
                <p className="text-[10px] text-muted-foreground">Stock & transfers</p>
              </div>
            </CardContent>
          </Card>
        </a>
        <a href="/alerts" className="block">
          <Card className="hover:shadow-sm transition-shadow h-full">
            <CardContent className="p-3 lg:p-4 flex flex-col items-center text-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">Alerts</p>
                <p className="text-[10px] text-muted-foreground">Operations center</p>
              </div>
            </CardContent>
          </Card>
        </a>
      </div>

      {/* Bottom section: Journey + Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Setup Progress
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${eng?.components?.setup_completion?.score ?? 0}%` }} />
              </div>
              <span className="text-xs font-bold text-blue-600">{Math.round(eng?.components?.setup_completion?.score ?? 0)}%</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              Feature Adoption
            </p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-600 rounded-full" style={{ width: `${eng?.components?.feature_adoption?.score ?? 0}%` }} />
              </div>
              <span className="text-xs font-bold text-green-600">{Math.round(eng?.components?.feature_adoption?.score ?? 0)}%</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

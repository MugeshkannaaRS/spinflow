import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import {
  Database,
  Server,
  Wifi,
  Cpu,
  Activity,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  BarChart3,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/health")({
  head: () => ({ meta: [{ title: "Platform Health — Admin — SpinFlow ERP" }] }),
  component: PlatformHealthPage,
});

const SERVICES = [
  { key: "database", label: "Database", icon: Database, color: "text-blue-600", bg: "bg-blue-50" },
  { key: "redis", label: "Redis Cache", icon: Server, color: "text-red-600", bg: "bg-red-50" },
  {
    key: "websocket",
    label: "WebSocket",
    icon: Wifi,
    color: "text-purple-600",
    bg: "bg-purple-50",
  },
  {
    key: "background_jobs",
    label: "Background Jobs",
    icon: Cpu,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  { key: "api", label: "API Health", icon: Activity, color: "text-green-600", bg: "bg-green-50" },
  {
    key: "storage",
    label: "Storage",
    icon: HardDrive,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
];

function ServiceCard({ service, status }: { service: (typeof SERVICES)[0]; status: any }) {
  const Icon = service.icon;
  const isUp = status?.status === "healthy" || status?.status === "up" || status === true;
  const isDegraded = status?.status === "degraded";
  const latency = status?.latency_ms ?? status?.response_time_ms;
  return (
    <Card
      className={`border-l-4 ${isUp ? "border-l-green-500" : isDegraded ? "border-l-amber-500" : "border-l-red-500"}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${service.bg} ${service.color}`}>
              <Icon className="size-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">{service.label}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {isUp ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="size-3" /> Healthy
                  </span>
                ) : isDegraded ? (
                  <span className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="size-3" /> Degraded
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <XCircle className="size-3" /> Down
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            {latency !== undefined && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {latency}ms
              </Badge>
            )}
          </div>
        </div>
        {status?.details && (
          <p className="text-[10px] text-muted-foreground mt-2">{status.details}</p>
        )}
        {status?.last_checked && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Last checked: {new Date(status.last_checked).toLocaleString("en-IN")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function PlatformHealthPage() {
  const user = useAuth((s) => s.user);

  const statusQ = useQuery({
    queryKey: ["admin-health-status"],
    queryFn: () => adminApi.getHealthStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const historyQ = useQuery({
    queryKey: ["admin-health-history"],
    queryFn: () => adminApi.getHealthHistory(7),
    staleTime: 60_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const hs = statusQ.data;
  const history: any[] = Array.isArray(historyQ.data?.items ?? historyQ.data?.data ?? historyQ.data)
    ? (historyQ.data?.items ?? historyQ.data?.data ?? historyQ.data)
    : [];

  const overallUp =
    hs?.overall_status === "healthy" ||
    (hs?.services &&
      Object.values(hs.services).every((v: any) => v?.status === "healthy" || v?.status === "up"));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Health Center</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            Overall status:
            {statusQ.isLoading ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> Checking...
              </span>
            ) : overallUp ? (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle2 className="size-3.5" /> All Systems Operational
              </span>
            ) : (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="size-3.5" /> Some Systems Degraded
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            statusQ.refetch();
            historyQ.refetch();
          }}
        >
          <RefreshCw className="size-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Service Cards Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SERVICES.map((service) => (
          <ServiceCard
            key={service.key}
            service={service}
            status={hs?.services?.[service.key] ?? hs?.[service.key]}
          />
        ))}
      </div>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="size-4" /> Health History (Last 7 Days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyQ.isLoading ? (
            <div className="h-20 bg-gray-100 rounded animate-pulse" />
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">No health history available.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                      Timestamp
                    </th>
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground">
                      Overall
                    </th>
                    {SERVICES.map((s) => (
                      <th
                        key={s.key}
                        className="text-center px-2 py-2 font-semibold text-muted-foreground"
                      >
                        {s.label.split(" ")[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 50).map((entry: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 text-muted-foreground">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={entry.overall_status ?? entry.status ?? "unknown"} />
                      </td>
                      {SERVICES.map((s) => {
                        const svc = entry.services?.[s.key] ?? entry[s.key];
                        const up =
                          svc?.status === "healthy" || svc?.status === "up" || svc === true;
                        return (
                          <td key={s.key} className="px-2 py-2 text-center">
                            {up ? (
                              <CheckCircle2 className="size-3.5 text-green-500 mx-auto" />
                            ) : svc?.status === "degraded" ? (
                              <AlertTriangle className="size-3.5 text-amber-500 mx-auto" />
                            ) : (
                              <XCircle className="size-3.5 text-red-500 mx-auto" />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

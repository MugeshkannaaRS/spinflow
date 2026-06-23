import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Database,
  Server,
  CreditCard,
  Cpu,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
  Clock,
  BarChart3,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/health")({
  head: () => ({ meta: [{ title: "Platform Health — Admin — SpinFlow ERP" }] }),
  component: PlatformHealthPage,
});

// Only real services that exist on this stack
const SERVICES = [
  { key: "database",        label: "Database",         icon: Database,   color: "text-blue-600",   bg: "#eff6ff" },
  { key: "redis",           label: "Redis Cache",      icon: Server,     color: "text-red-600",    bg: "#fff1f2" },
  { key: "billing",         label: "Billing Service",  icon: CreditCard, color: "text-teal-600",   bg: "#f0fdfa" },
  { key: "background_jobs", label: "Background Jobs",  icon: Cpu,        color: "text-amber-600",  bg: "#fffbeb" },
  { key: "api",             label: "API",              icon: Activity,   color: "text-green-600",  bg: "#f0fdf4" },
];

function statusColor(st: string) {
  if (st === "healthy") return { border: "#22c55e", dot: "bg-green-500", text: "text-green-700", label: "Healthy" };
  if (st === "warning" || st === "degraded") return { border: "#f59e0b", dot: "bg-amber-400", text: "text-amber-700", label: "Degraded" };
  return { border: "#ef4444", dot: "bg-red-500", text: "text-red-700", label: "Down" };
}

function ServiceCard({ svc, data }: { svc: (typeof SERVICES)[0]; data: any }) {
  const Icon = svc.icon;
  const st = data?.status ?? "unknown";
  const sc = statusColor(st);
  const latency = data?.latency_ms ?? data?.response_time_ms;
  const detail = data?.error ?? data?.invoices_24h !== undefined
    ? (data.error ?? `${data.invoices_24h} invoices last 24h`)
    : data?.pending_expirations !== undefined
    ? `${data.pending_expirations} pending expirations`
    : null;

  return (
    <div
      className="bg-white rounded-xl border-l-4 shadow-sm p-4 flex items-start gap-3"
      style={{ borderLeftColor: sc.border, borderTop: "1px solid #f1f5f9", borderRight: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}
    >
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: svc.bg }}>
        <Icon className={`w-4 h-4 ${svc.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-800">{svc.label}</p>
          {latency !== undefined && (
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{latency}ms</span>
          )}
        </div>
        <div className={`flex items-center gap-1.5 mt-0.5 text-xs font-medium ${sc.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </div>
        {detail && <p className="text-[11px] text-gray-400 mt-1 truncate">{detail}</p>}
      </div>
    </div>
  );
}

function PlatformHealthPage() {
  const user = useAuth((s) => s.user);

  const statusQ = useQuery({
    queryKey: ["admin-health-status"],
    queryFn: () => adminApi.getHealthStatus(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const historyQ = useQuery({
    queryKey: ["admin-health-history"],
    queryFn: () => adminApi.getHealthHistory(7),
    staleTime: 60_000,
    retry: 1,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-red-600 font-medium">Only Super Admin can access this page.</div>;
  }

  // Backend returns { overall: "healthy"|"degraded", components: { database: {...}, ... } }
  const components: Record<string, any> = statusQ.data?.components ?? {};
  const overall: string = statusQ.data?.overall ?? "unknown";

  // History is flat rows: [{component, status, checked_at}]
  // Group by checked_at bucket (minute) to show per-timestamp rows
  const historyRows: any[] = Array.isArray(historyQ.data) ? historyQ.data : [];

  // Group into timestamp buckets — rows within same minute are one check cycle
  const buckets = new Map<string, Record<string, string>>();
  for (const row of historyRows) {
    const ts = row.checked_at ? row.checked_at.slice(0, 16) : "unknown"; // minute precision
    if (!buckets.has(ts)) buckets.set(ts, {});
    buckets.get(ts)![row.component] = row.status;
  }
  const bucketEntries = Array.from(buckets.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 30);

  const overallSc = statusColor(overall === "healthy" ? "healthy" : overall === "degraded" ? "warning" : "critical");

  return (
    <div className="min-h-screen bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Health</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">Overall status:</span>
              {statusQ.isLoading ? (
                <span className="flex items-center gap-1 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking…
                </span>
              ) : (
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${overallSc.text}`}>
                  <span className={`w-2 h-2 rounded-full ${overallSc.dot}`} />
                  {overall === "healthy" ? "All Systems Operational" : overall === "degraded" ? "Some Systems Degraded" : "Status Unknown"}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { statusQ.refetch(); historyQ.refetch(); }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
        </div>

        {/* Service Cards */}
        {statusQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <div key={s.key} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-20 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((svc) => (
              <ServiceCard
                key={svc.key}
                svc={svc}
                // API always "healthy" if reachable (we're talking to it right now)
                data={svc.key === "api" ? { status: "healthy" } : (components[svc.key] ?? { status: "unknown" })}
              />
            ))}
          </div>
        )}

        {/* Health History */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-800">Health History (Last 7 Days)</span>
          </div>

          {historyQ.isLoading ? (
            <div className="p-6 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : bucketEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Clock className="w-9 h-9 text-gray-200 mb-2" />
              <p className="text-sm font-medium text-gray-500">No health history yet</p>
              <p className="text-xs text-gray-400 mt-1">History is recorded each time health is checked</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Timestamp</th>
                    {SERVICES.filter(s => s.key !== "api").map((s) => (
                      <th key={s.key} className="text-center px-3 py-2.5 font-semibold text-gray-500">{s.label.split(" ")[0]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bucketEntries.map(([ts, comps], i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 font-mono">
                        {ts !== "unknown"
                          ? new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </td>
                      {SERVICES.filter(s => s.key !== "api").map((s) => {
                        const st = comps[s.key];
                        return (
                          <td key={s.key} className="px-3 py-2.5 text-center">
                            {!st ? (
                              <span className="text-gray-300">—</span>
                            ) : st === "healthy" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mx-auto" />
                            ) : st === "warning" || st === "degraded" ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-red-500 mx-auto" />
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
        </div>

      </div>
    </div>
  );
}

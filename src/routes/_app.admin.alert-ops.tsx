import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { alertsApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Bell, AlertTriangle, CheckCircle2, Clock, Activity,
  Loader2, Siren, UserCheck, Flame, BarChart3,
  Filter, RefreshCw, XCircle, Eye,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/alert-ops")({
  head: () => ({ meta: [{ title: "Alert Operations Center — Admin — SpinFlow ERP" }] }),
  component: AlertOpsCenter,
});

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700", high: "bg-orange-100 text-orange-700",
    medium: "bg-amber-100 text-amber-700", low: "bg-blue-100 text-blue-700",
    info: "bg-gray-100 text-gray-700",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${map[severity] ?? map.info}`}>{severity}</span>;
}

function AlertOpsCenter() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedAlert, setSelectedAlert] = useState<any>(null);

  const alertsQ = useQuery({
    queryKey: ["alert-ops-list", statusFilter, severityFilter],
    queryFn: () => alertsApi.getAlerts({
      page_size: 100,
      status: statusFilter !== "all" ? statusFilter : undefined,
      severity: severityFilter !== "all" ? severityFilter : undefined,
    }),
    staleTime: 15_000,
  });

  const summaryQ = useQuery({
    queryKey: ["alert-ops-summary"],
    queryFn: () => alertsApi.getOpsCenterSummary(),
    staleTime: 15_000,
  });

  const timelineQ = useQuery({
    queryKey: ["alert-timeline", selectedAlert?.id],
    queryFn: () => alertsApi.getTimeline(selectedAlert.id),
    enabled: !!selectedAlert?.id,
    staleTime: 10_000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) => alertsApi.acknowledge(id),
    onSuccess: () => { toast.success("Alert acknowledged"); qc.invalidateQueries({ queryKey: ["alert-ops"] }); },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed"),
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => alertsApi.resolve(id),
    onSuccess: () => { toast.success("Alert resolved"); qc.invalidateQueries({ queryKey: ["alert-ops"] }); },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed"),
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const alerts: any[] = Array.isArray(alertsQ.data?.items ?? alertsQ.data?.data) ? (alertsQ.data?.items ?? alertsQ.data?.data) : [];
  const summary = summaryQ.data;
  const timeline: any[] = Array.isArray(timelineQ.data?.items ?? timelineQ.data?.data ?? timelineQ.data) ? (timelineQ.data?.items ?? timelineQ.data?.data ?? timelineQ.data) : [];

  const heatmapData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of alerts) {
      const day = a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN") : "unknown";
      counts[day] = (counts[day] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [alerts]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alert Operations Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Real-time alert management with timeline, escalation, and heatmaps</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["alert-ops"] })}>
          <RefreshCw className="size-3.5 mr-1.5" /> Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{summary?.critical ?? "—"}</p><p className="text-xs text-muted-foreground">Critical</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-600">{summary?.high ?? "—"}</p><p className="text-xs text-muted-foreground">High</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-amber-500">{summary?.medium ?? "—"}</p><p className="text-xs text-muted-foreground">Medium</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-blue-600">{summary?.low ?? "—"}</p><p className="text-xs text-muted-foreground">Low / Info</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs font-medium text-muted-foreground self-center">Severity:</span>
        {["all", "critical", "high", "medium", "low", "info"].map((s) => (
          <button key={s} onClick={() => setSeverityFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full capitalize ${
              severityFilter === s ? "bg-blue-100 text-blue-700 font-medium" : "bg-gray-50 text-muted-foreground hover:bg-gray-100"
            }`}
          >{s}</button>
        ))}
        <span className="text-xs font-medium text-muted-foreground self-center ml-2">Status:</span>
        {["all", "open", "acknowledged", "resolved"].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-2.5 py-1 rounded-full capitalize ${
              statusFilter === s ? "bg-blue-100 text-blue-700 font-medium" : "bg-gray-50 text-muted-foreground hover:bg-gray-100"
            }`}
          >{s === "all" ? "All" : s}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alert Feed */}
        <div className="lg:col-span-2 space-y-2">
          {alertsQ.isLoading ? (
            [1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">No alerts</p>
              <p className="text-xs text-muted-foreground">All systems operational.</p>
            </div>
          ) : (
            alerts.map((a: any) => (
              <Card key={a.id} className={`cursor-pointer transition-all ${selectedAlert?.id === a.id ? "ring-2 ring-blue-300" : "hover:shadow-sm"}`} onClick={() => setSelectedAlert(a)}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-1.5 rounded-full mt-0.5 ${
                      a.severity === "critical" ? "bg-red-100 text-red-600" :
                      a.severity === "high" ? "bg-orange-100 text-orange-600" :
                      a.severity === "medium" ? "bg-amber-100 text-amber-600" : "bg-blue-100 text-blue-600"
                    }`}>
                      {a.severity === "critical" ? <AlertTriangle className="size-4" /> : <Bell className="size-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold">{a.title ?? a.name ?? "Alert"}</p>
                        <SeverityBadge severity={a.severity ?? "info"} />
                        <StatusBadge status={a.status ?? "open"} />
                        {a.acknowledged && <Badge variant="outline" className="text-[9px]"><Eye className="size-3 mr-0.5" /> Ack'd</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{a.description ?? a.message ?? ""}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {a.category && <>{a.category} · </>}
                        {a.created_at ? new Date(a.created_at).toLocaleString("en-IN") : ""}
                        {a.company_name && <> · {a.company_name}</>}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selectedAlert ? (
            <>
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm">Alert Details</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={selectedAlert.status ?? "open"} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Severity</span><SeverityBadge severity={selectedAlert.severity ?? "info"} /></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{selectedAlert.category ?? "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Acknowledged</span><span>{selectedAlert.acknowledged ? "Yes" : "No"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Escalation</span><span className="capitalize">{selectedAlert.escalation_level ?? selectedAlert.escalation_status ?? "none"}</span></div>
                  <div className="pt-2 flex gap-2">
                    {selectedAlert.status !== "resolved" && selectedAlert.status !== "acknowledged" && (
                      <Button size="sm" variant="outline" onClick={() => acknowledgeMutation.mutate(selectedAlert.id)} disabled={acknowledgeMutation.isPending}>
                        <UserCheck className="size-3.5 mr-1" /> Acknowledge
                      </Button>
                    )}
                    {selectedAlert.status !== "resolved" && (
                      <Button size="sm" onClick={() => resolveMutation.mutate(selectedAlert.id)} disabled={resolveMutation.isPending}>
                        <CheckCircle2 className="size-3.5 mr-1" /> Resolve
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Activity className="size-3.5" /> Timeline</CardTitle></CardHeader>
                <CardContent>
                  {timelineQ.isLoading ? (
                    <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
                  ) : timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No timeline events.</p>
                  ) : (
                    <div className="space-y-3">
                      {timeline.map((entry: any, i: number) => (
                        <div key={i} className="flex gap-2">
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                            {i < timeline.length - 1 && <div className="w-px flex-1 bg-blue-200" />}
                          </div>
                          <div className="pb-2">
                            <p className="text-xs font-medium capitalize">{entry.event ?? entry.action}</p>
                            <p className="text-[10px] text-muted-foreground">{entry.performed_by ?? entry.actor} · {entry.created_at ? new Date(entry.created_at).toLocaleString("en-IN") : ""}</p>
                            {entry.notes && <p className="text-[10px] text-muted-foreground">{entry.notes}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <Eye className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Select an alert</p>
                <p className="text-xs text-muted-foreground mt-1">Click on any alert to see details, timeline, and actions.</p>
              </CardContent>
            </Card>
          )}

          {/* Heatmap */}
          <Card>
            <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Flame className="size-3.5" /> Alert Heatmap</CardTitle></CardHeader>
            <CardContent>
              {heatmapData.length === 0 ? (
                <p className="text-xs text-muted-foreground">No data.</p>
              ) : (
                <div className="space-y-1">
                  {heatmapData.slice(-14).map(([day, count]) => {
                    const intensity = Math.min(count / Math.max(...heatmapData.map(([, c]) => c), 1), 1);
                    return (
                      <div key={day} className="flex items-center gap-2 text-[10px]">
                        <span className="w-20 text-muted-foreground truncate">{day}</span>
                        <div className="flex-1 h-3 rounded" style={{ backgroundColor: `rgba(239, 68, 68, ${intensity})`, width: `${intensity * 100}%` }} />
                        <span className="w-4 text-right font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

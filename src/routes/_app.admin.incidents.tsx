import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Activity,
  Plus,
  Siren,
  Flag,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/incidents")({
  head: () => ({ meta: [{ title: "Incident Management — Admin — SpinFlow ERP" }] }),
  component: IncidentManagementPage,
});

function IncidentManagementPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState("open");

  const incidentsQ = useQuery({
    queryKey: ["admin-incidents", tab],
    queryFn: () =>
      adminApi.getIncidents({ status: tab !== "all" ? tab : undefined, page_size: 50 }),
    staleTime: 15_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const incidents: any[] = Array.isArray(
    incidentsQ.data?.items ?? incidentsQ.data?.data ?? incidentsQ.data,
  )
    ? (incidentsQ.data?.items ?? incidentsQ.data?.data ?? incidentsQ.data)
    : [];

  const criticalCount = incidents.filter(
    (i: any) => i.severity === "critical" || i.priority === "critical",
  ).length;
  const openCount = incidents.filter(
    (i: any) => i.status === "open" || i.status === "in_progress",
  ).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Incident Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {openCount} open · {criticalCount} critical
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["admin-incidents"] })}
          >
            <Loader2 className="size-3.5 mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              </div>
              <AlertTriangle className="size-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open</p>
                <p className="text-2xl font-bold text-amber-600">{openCount}</p>
              </div>
              <Siren className="size-8 text-amber-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">
                  {incidents.filter((i: any) => i.status === "in_progress").length}
                </p>
              </div>
              <Activity className="size-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Resolved</p>
                <p className="text-2xl font-bold text-green-600">
                  {incidents.filter((i: any) => i.status === "resolved").length}
                </p>
              </div>
              <CheckCircle2 className="size-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {["open", "in_progress", "resolved", "all"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-gray-700"
            }`}
          >
            {t.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Incident List */}
      {incidentsQ.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="size-12 text-emerald-300 mb-4" />
          <p className="text-lg font-medium">No incidents</p>
          <p className="text-sm text-muted-foreground mt-1">All clear — no incidents to display.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((inc: any) => (
            <Card key={inc.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-full ${
                      inc.severity === "critical" || inc.priority === "critical"
                        ? "bg-red-100 text-red-600"
                        : inc.status === "open"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-blue-100 text-blue-600"
                    }`}
                  >
                    {inc.severity === "critical" || inc.priority === "critical" ? (
                      <AlertTriangle className="size-4" />
                    ) : (
                      <Flag className="size-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {inc.title ?? inc.name ?? `Incident #${inc.id?.slice(0, 8)}`}
                      </p>
                      <StatusBadge status={inc.status ?? "open"} />
                      {(inc.severity === "critical" || inc.priority === "critical") && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                          Critical
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{inc.description ?? ""}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                      {inc.assigned_to && <span>Assignee: {inc.assigned_to}</span>}
                      {inc.created_at && (
                        <span>Created: {new Date(inc.created_at).toLocaleString("en-IN")}</span>
                      )}
                      {inc.resolved_at && (
                        <span>Resolved: {new Date(inc.resolved_at).toLocaleString("en-IN")}</span>
                      )}
                    </div>
                  </div>
                  {inc.status !== "resolved" && (
                    <ArrowRight className="size-4 text-muted-foreground shrink-0 mt-1" />
                  )}
                </div>

                {/* Timeline */}
                {inc.timeline && inc.timeline.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">
                      Timeline
                    </p>
                    <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
                      {inc.timeline.map((entry: any, i: number) => (
                        <span key={i} className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                          {entry.event ?? entry.action} ·{" "}
                          {entry.created_at
                            ? new Date(entry.created_at).toLocaleString("en-IN")
                            : ""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

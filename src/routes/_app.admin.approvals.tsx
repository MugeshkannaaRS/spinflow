import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, mastersApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, Clock, ArrowUpRight, AlertTriangle,
  Loader2, UserCheck, Building2, FileText, History,
  ChevronRight, ThumbsUp, ThumbsDown, Send,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/approvals")({
  head: () => ({ meta: [{ title: "Approval Center — Admin — SpinFlow ERP" }] }),
  component: ApprovalCenterPage,
});

const TABS = [
  { key: "pending", label: "Pending", icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", icon: XCircle },
  { key: "escalated", label: "Escalated", icon: ArrowUpRight },
];

function ApprovalCenterPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");
  const [companyId, setCompanyId] = useState<string>("");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const companiesQ = useQuery({
    queryKey: ["masters-companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
  });

  const requestsQ = useQuery({
    queryKey: ["approval-requests", tab, companyId],
    queryFn: () => adminApi.getApprovalRequests({ status: tab === "escalated" ? "escalated" : tab, company_id: companyId || undefined, page_size: 50 }),
    staleTime: 15_000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: string; comment?: string }) =>
      adminApi.actionApprovalRequest(id, { action, comment }),
    onSuccess: () => {
      toast.success("Approval action recorded");
      qc.invalidateQueries({ queryKey: ["approval-requests"] });
      setSelectedRequest(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Action failed"),
  });

  const companies: any[] = Array.isArray(companiesQ.data) ? companiesQ.data : [];
  const requests: any[] = Array.isArray(requestsQ.data?.items ?? requestsQ.data?.data ?? requestsQ.data) ? (requestsQ.data?.items ?? requestsQ.data?.data ?? requestsQ.data) : [];

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const tabCounts = {
    pending: requestsQ.data?.total ?? requests.filter((r: any) => r.status === "pending").length,
    approved: requestsQ.data?.total ?? requests.filter((r: any) => r.status === "approved").length,
    rejected: requestsQ.data?.total ?? requests.filter((r: any) => r.status === "rejected").length,
    escalated: requestsQ.data?.total ?? requests.filter((r: any) => r.status === "escalated").length,
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Approval Center</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and manage approval requests across companies</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white">
          <option value="">All Companies</option>
          {companies.map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? "border-blue-600 text-blue-600" : "border-transparent text-muted-foreground hover:text-gray-700"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedRequest && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="size-4" /> Approval Detail
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)}><XCircle className="size-3.5" /></Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground text-xs">Type</span><p className="font-medium capitalize">{selectedRequest.approval_type ?? selectedRequest.type ?? "—"}</p></div>
              <div><span className="text-muted-foreground text-xs">Status</span><p><StatusBadge status={selectedRequest.status} /></p></div>
              <div><span className="text-muted-foreground text-xs">Requester</span><p className="font-medium">{selectedRequest.requested_by_name ?? selectedRequest.requested_by ?? "—"}</p></div>
              <div><span className="text-muted-foreground text-xs">Created</span><p className="font-medium">{selectedRequest.created_at ? new Date(selectedRequest.created_at).toLocaleString("en-IN") : "—"}</p></div>
            </div>
            {selectedRequest.reason && (
              <div><span className="text-xs text-muted-foreground">Reason</span><p className="text-sm mt-0.5">{selectedRequest.reason}</p></div>
            )}
            <div className="flex gap-2 pt-2">
              {tab === "pending" && (
                <>
                  <Button size="sm" onClick={() => actionMutation.mutate({ id: selectedRequest.id, action: "approve" })} disabled={actionMutation.isPending}>
                    <ThumbsUp className="size-3.5 mr-1.5" /> Approve
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => actionMutation.mutate({ id: selectedRequest.id, action: "reject" })} disabled={actionMutation.isPending}>
                    <ThumbsDown className="size-3.5 mr-1.5" /> Reject
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: selectedRequest.id, action: "escalate" })} disabled={actionMutation.isPending}>
                    <ArrowUpRight className="size-3.5 mr-1.5" /> Escalate
                  </Button>
                </>
              )}
            </div>

            {/* Timeline */}
            {selectedRequest.timeline && selectedRequest.timeline.length > 0 && (
              <div className="pt-3 border-t border-blue-100">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Timeline</h4>
                <div className="space-y-3">
                  {selectedRequest.timeline.map((entry: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                        {i < selectedRequest.timeline.length - 1 && <div className="w-px flex-1 bg-blue-200" />}
                      </div>
                      <div className="pb-3">
                        <p className="text-sm font-medium capitalize">{entry.action ?? entry.event}</p>
                        <p className="text-xs text-muted-foreground">{entry.performed_by ?? entry.user} · {entry.created_at ? new Date(entry.created_at).toLocaleString("en-IN") : ""}</p>
                        {entry.comment && <p className="text-xs text-muted-foreground mt-0.5">{entry.comment}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* List */}
      {requestsQ.isLoading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle2 className="size-12 text-emerald-300 mb-4" />
          <p className="text-lg font-medium">No {tab} approvals</p>
          <p className="text-sm text-muted-foreground mt-1">All clear — no {tab} requests to review.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req: any) => (
            <Card key={req.id} className={`cursor-pointer transition-colors hover:shadow-sm ${selectedRequest?.id === req.id ? "ring-2 ring-blue-200" : ""}`} onClick={() => setSelectedRequest(req)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm capitalize">{req.approval_type ?? req.type ?? "Approval Request"}</p>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {req.company_name && <>{req.company_name} · </>}
                      {req.requested_by_name ?? req.requested_by ?? "Unknown"} · {req.created_at ? new Date(req.created_at).toLocaleDateString("en-IN") : ""}
                    </p>
                    {req.reason && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{req.reason}</p>}
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

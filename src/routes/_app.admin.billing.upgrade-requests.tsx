import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowUpCircle,
  ChevronLeft,
  AlertTriangle,
  Loader2,
  Building2,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/billing/upgrade-requests")({
  head: () => ({ meta: [{ title: "Upgrade Requests — Admin Billing — SpinFlow ERP" }] }),
  component: UpgradeRequestsPage,
});

// ── API helpers ──────────────────────────────────────────────────────────────

async function fetchRequests(status?: string) {
  const params: Record<string, string> = {};
  if (status && status !== "all") params.status = status;
  const r = await api.get("/subscription/change-requests", { params });
  return r.data as { items: any[]; total: number };
}

async function reviewRequest(
  requestId: string,
  status: "approved" | "rejected",
  review_notes?: string,
) {
  const r = await api.put(`/subscription/change-requests/${requestId}/review`, {
    status,
    review_notes,
  });
  return r.data;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "Pending", icon: Clock, cls: "bg-amber-50  text-amber-700  border-amber-200" },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    cls: "bg-green-50  text-green-700  border-green-200",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    cls: "bg-red-50    text-red-700    border-red-200",
  },
};

// ── Review modal (inline) ────────────────────────────────────────────────────

function ReviewModal({
  req,
  action,
  onClose,
  onConfirm,
  loading,
}: {
  req: any;
  action: "approve" | "reject";
  onClose: () => void;
  onConfirm: (notes: string) => void;
  loading: boolean;
}) {
  const [notes, setNotes] = useState("");
  const isReject = action === "reject";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-start gap-3">
          {isReject ? (
            <XCircle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
          )}
          <div>
            <p className="font-semibold text-sm">
              {isReject ? "Reject upgrade request?" : "Approve upgrade request?"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isReject
                ? `This will cancel the upgrade for ${req.company_name ?? req.company_id}.`
                : `This will immediately activate the ${req.to_plan_name} plan for ${req.company_name ?? req.company_id}.`}
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1">
            {isReject ? "Reason for rejection (required)" : "Note to company (optional)"}
          </label>
          <textarea
            className="w-full border rounded-lg p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={3}
            placeholder={
              isReject
                ? "e.g. Payment confirmation pending…"
                : "e.g. Plan activated, billing starts 1 July…"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={loading || (isReject && !notes.trim())}
            className={cn(
              isReject
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-green-600 hover:bg-green-700 text-white",
            )}
            onClick={() => onConfirm(notes.trim())}
          >
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            {isReject ? "Reject" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function UpgradeRequestsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [modal, setModal] = useState<{ req: any; action: "approve" | "reject" } | null>(null);

  const requestsQ = useQuery({
    queryKey: ["upgrade-requests", filter],
    queryFn: () => fetchRequests(filter),
    staleTime: 15_000,
  });

  const reviewMut = useMutation({
    mutationFn: ({
      requestId,
      status,
      notes,
    }: {
      requestId: string;
      status: "approved" | "rejected";
      notes: string;
    }) => reviewRequest(requestId, status, notes),
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "approved" ? "Plan activated successfully." : "Request rejected.",
      );
      setModal(null);
      qc.invalidateQueries({ queryKey: ["upgrade-requests"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to process request.");
    },
  });

  const items: any[] = requestsQ.data?.items ?? [];
  const total = requestsQ.data?.total ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: "/admin/billing" })}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-orange-500" />
            Upgrade Requests
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review and approve plan change requests from Mill Owners.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b pb-0">
        {(["pending", "all", "approved", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors -mb-px",
              filter === f
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      {requestsQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading requests…
        </div>
      ) : requestsQ.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
          <p className="text-sm text-red-700">Failed to load upgrade requests.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => requestsQ.refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <ArrowUpCircle className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No {filter === "all" ? "" : filter} upgrade requests
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            {filter === "pending"
              ? "All caught up — no requests waiting for review."
              : "No requests match this filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {total} request{total !== 1 ? "s" : ""}
          </p>
          {items.map((item) => {
            const sc = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending;
            const StatusIcon = sc.icon;
            const fromPlanName = item.current_plan_name ?? item.current_plan_id?.slice(0, 8) ?? "—";
            const toPlanName =
              item.requested_plan_name ?? item.requested_plan_id?.slice(0, 8) ?? "—";

            return (
              <div
                key={item.id}
                className="rounded-xl border bg-white p-4 flex items-start gap-4 hover:shadow-sm transition-shadow"
              >
                <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4 text-orange-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm truncate">
                      {item.company_name ?? item.company_id?.slice(0, 8)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                        sc.cls,
                      )}
                    >
                      <StatusIcon className="w-3 h-3" />
                      {sc.label}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium text-foreground">{fromPlanName}</span>
                    {" → "}
                    <span className="font-medium text-blue-700">{toPlanName}</span>
                    {" · "}
                    Requested {fmtDate(item.created_at)}
                    {item.reason && ` · "${item.reason}"`}
                  </p>

                  {item.review_notes && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      Note: {item.review_notes}
                    </p>
                  )}

                  {item.reviewed_at && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Reviewed {fmtDate(item.reviewed_at)}
                    </p>
                  )}
                </div>

                {item.status === "pending" && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setModal({ req: { ...item, to_plan_name: toPlanName }, action: "reject" })
                      }
                      className="px-3 py-1.5 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 font-medium transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() =>
                        setModal({ req: { ...item, to_plan_name: toPlanName }, action: "approve" })
                      }
                      className="px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review modal */}
      {modal && (
        <ReviewModal
          req={modal.req}
          action={modal.action}
          onClose={() => setModal(null)}
          onConfirm={(notes) =>
            reviewMut.mutate({
              requestId: modal.req.id,
              status: modal.action === "approve" ? "approved" : "rejected",
              notes,
            })
          }
          loading={reviewMut.isPending}
        />
      )}
    </div>
  );
}

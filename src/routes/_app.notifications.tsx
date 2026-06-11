import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Check, CheckCheck, Archive } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/time";

export const Route = createFileRoute("/_app/notifications")({
  head: () => ({ meta: [{ title: "Notifications — SpinFlow ERP" }] }),
  component: NotificationsPage,
});

interface Notification {
  id: string;
  title: string;
  message: string | null;
  severity: string;
  category: string;
  priority: string;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
  action_url: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  EMERGENCY: "bg-red-600",
  CRITICAL: "bg-red-500",
  WARNING: "bg-amber-500",
  INFO: "bg-blue-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  EMERGENCY: "bg-red-100 text-red-700",
  CRITICAL: "bg-red-100 text-red-600",
  WARNING: "bg-amber-100 text-amber-700",
  INFO: "bg-blue-100 text-blue-700",
};

const CATEGORY_LABELS: Record<string, string> = {
  MACHINE: "Machine",
  SECURITY: "Security",
  HR: "HR",
  BILLING: "Billing",
  INVENTORY: "Inventory",
  SYSTEM: "System",
};

function NotificationsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [category, setCategory] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-full", page, unreadOnly, category],
    queryFn: () =>
      api.get("/notifications", {
        params: { page, page_size: 20, unread_only: unreadOnly || undefined, category: category || undefined },
      }).then((r: any) => r.data),
    staleTime: 30_000,
  });

  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-full"] }),
  });

  const markAllMut = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-full"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications-full"] }),
  });

  const notifications: Notification[] = data?.data ?? [];
  const total: number = data?.total ?? 0;
  const pages: number = data?.pages ?? 1;
  const unreadTotal = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">All Notifications</h2>
          {total > 0 && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{total} total</span>
          )}
        </div>
        {unreadTotal > 0 && (
          <button
            onClick={() => markAllMut.mutate()}
            disabled={markAllMut.isPending}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors",
            unreadOnly
              ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          )}
        >
          <Bell className="w-3.5 h-3.5" />
          {unreadOnly ? "Unread only" : "All"}
        </button>
        {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
          <button
            key={code}
            onClick={() => { setCategory((v) => v === code ? "" : code); setPage(1); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm border transition-colors",
              category === code
                ? "bg-gray-900 border-gray-900 text-white font-medium"
                : "border-gray-200 text-gray-600 hover:bg-gray-50"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-gray-400">
              <BellOff className="w-10 h-10" />
              <p className="text-sm">No notifications{unreadOnly ? " — you're all caught up!" : ""}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors group",
                    !n.is_read && "bg-blue-50/30"
                  )}
                >
                  {/* Severity dot */}
                  <span
                    className={cn(
                      "mt-1.5 w-2.5 h-2.5 shrink-0 rounded-full",
                      SEVERITY_COLORS[n.severity] || "bg-gray-300"
                    )}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-[14px] leading-snug",
                        n.is_read ? "text-gray-700" : "font-semibold text-gray-900"
                      )}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap mt-0.5">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    {n.message && (
                      <p className="text-sm text-gray-500 mt-0.5 leading-snug">{n.message}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        SEVERITY_BADGE[n.severity] || "bg-gray-100 text-gray-600"
                      )}>
                        {n.severity}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {CATEGORY_LABELS[n.category] || n.category}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    {!n.is_read && (
                      <button
                        onClick={() => markReadMut.mutate(n.id)}
                        title="Mark as read"
                        className="p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 text-gray-400 hover:text-green-600"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => archiveMut.mutate(n.id)}
                      title="Archive"
                      className="p-1.5 rounded-md hover:bg-white border border-transparent hover:border-gray-200 text-gray-400 hover:text-gray-600"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            ← Previous
          </button>
          <span className="text-sm text-gray-500">
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * useNotifications — Wave 4A
 *
 * DB-backed notification hook. Fetches from /notifications and /notifications/unread-count.
 * Triggers a refetch when a new notification arrives via WebSocket.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

export interface DbNotification {
  id: string;
  title: string;
  message: string | null;
  severity: string;
  category: string;
  priority: string;
  icon: string | null;
  action_url: string | null;
  is_read: boolean;
  is_archived: boolean;
  created_at: string;
  read_at: string | null;
}

export function useNotifications(opts?: { limit?: number }) {
  const qc = useQueryClient();
  const limit = opts?.limit ?? 10;

  // Unread count (fast, badge)
  const countQ = useQuery<number>({
    queryKey: ["notifications-unread-count"],
    queryFn: () =>
      api.get("/notifications/unread-count").then((r: any) => r.data.unread_count ?? 0),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  // Recent notifications (for dropdown)
  const listQ = useQuery<DbNotification[]>({
    queryKey: ["notifications-list", limit],
    queryFn: () =>
      api
        .get("/notifications", { params: { page_size: limit } })
        .then((r: any) => r.data?.data ?? []),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // When WS fires a new notification, refresh both queries
  const { lastMessage } = useWebSocket();
  useEffect(() => {
    if (!lastMessage) return;
    if (lastMessage.type === "notification") {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
    }
  }, [lastMessage, qc]);

  // mark one read
  const markReadMut = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  // mark all read
  const markAllReadMut = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  });

  // archive
  const archiveMut = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  return {
    unreadCount: countQ.data ?? 0,
    notifications: listQ.data ?? [],
    isLoading: listQ.isLoading,
    markRead: (id: string) => markReadMut.mutate(id),
    markAllRead: () => markAllReadMut.mutate(),
    archive: (id: string) => archiveMut.mutate(id),
    refetch: () => {
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
      qc.invalidateQueries({ queryKey: ["notifications-list"] });
    },
  };
}

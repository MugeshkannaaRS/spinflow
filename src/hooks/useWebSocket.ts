import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/stores/auth";

interface NotificationPayload {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
  module: string;
  created_at: string;
}

interface MachineBreakdownPayload {
  machine_id: string;
  machine_no: string;
  reason: string;
  timestamp: string;
}

interface LowStockPayload {
  item_id: string;
  item_name: string;
  current_stock: number;
  reorder_level: number;
}

interface WrongDestinationPayload {
  trip_no: string;
  bag_no: string;
  lot_no: string;
  expected_route: string;
  actual_route: string;
  timestamp: string;
}

interface PingMessage {
  type: "ping";
  payload: Record<string, never>;
}

export function useWebSocket() {
  const token = useAuth((s) => s.token);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<
    | { type: "notification"; payload: NotificationPayload }
    | { type: "machine_breakdown"; payload: MachineBreakdownPayload }
    | { type: "low_stock"; payload: LowStockPayload }
    | { type: "wrong_destination"; payload: WrongDestinationPayload }
    | { type: "ping"; payload: Record<string, never> }
    | null
  >(null);
  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastWrongDestination, setLastWrongDestination] = useState<WrongDestinationPayload | null>(
    null,
  );

  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    if (!token) return;

    isMountedRef.current = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 1000;
    let intentionalClose = false;

    async function connect() {
      const { API_BASE } = await import("@/lib/api");
      const wsBase = API_BASE.replace(/^http/, "ws");
      const url = `${wsBase}/ws/notifications?token=${token}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        setIsConnected(true);
        backoff = 1000;
      };

      ws.onclose = (e) => {
        wsRef.current = null;
        if (!isMountedRef.current) return;
        setIsConnected(false);

        if (intentionalClose) return;
        if (e.code === 4001) return;

        reconnectTimer = setTimeout(() => {
          if (isMountedRef.current) connect();
        }, backoff);

        backoff = Math.min(backoff * 2, 30000);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as any;
          setLastMessage(data);

          // ping/pong handling
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }

          if (data.type === "pong" || data.type === "connected") return;

          // Normalize server events into a notification-like payload
          const notif: NotificationPayload = {
            id:
              data.id || data.dispatch_no || data.lot_no || data.machine_code || String(Date.now()),
            title: data.type,
            message: data.message || data.reason || data.item || JSON.stringify(data).slice(0, 200),
            type: "info",
            module: (data.type || "").split(".")[0],
            created_at: new Date().toISOString(),
          };

          if (data.type === "wrong_destination") {
            setLastWrongDestination(data as WrongDestinationPayload);
          }

          setNotifications((prev) => [notif, ...prev].slice(0, 50));
          setUnreadCount((prev) => prev + 1);
        } catch (err) {
          console.error("Failed to parse WebSocket message", err);
        }
      };
    }

    connect();

    return () => {
      isMountedRef.current = false;
      intentionalClose = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [token]);

  return {
    isConnected,
    lastMessage,
    notifications,
    clearNotifications,
    unreadCount,
    markAllRead,
    lastWrongDestination,
  };
}

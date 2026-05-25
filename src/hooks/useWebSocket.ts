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
    let intentionalClose = false;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    const API_BASE =
      import.meta.env.VITE_API_BASE_URL || "https://spinflow.onrender.com";
    const WS_BASE = API_BASE.replace("https://", "wss://").replace("http://", "ws://");
    const wsUrl = `${WS_BASE}/ws/notifications?token=${token}`;

    function connect() {
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) {
            ws.close();
            return;
          }
          setIsConnected(true);
          retryCount = 0;
        };

        ws.onclose = (e) => {
          wsRef.current = null;
          if (!isMountedRef.current || intentionalClose || e.code === 4001) return;
          setIsConnected(false);

          if (retryCount >= MAX_RETRIES) return;

          retryCount += 1;
          const backoff = Math.min(1000 * Math.pow(2, retryCount - 1), 8000);
          reconnectTimer = setTimeout(() => {
            if (isMountedRef.current) connect();
          }, backoff);
        };

        ws.onerror = () => {
          // errors surface via onclose; suppress to avoid console noise
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data) as any;
            setLastMessage(data);

            if (data.type === "ping") {
              ws.send(JSON.stringify({ type: "pong" }));
              return;
            }

            if (data.type === "pong" || data.type === "connected") return;

            const notif: NotificationPayload = {
              id:
                data.id ||
                data.dispatch_no ||
                data.lot_no ||
                data.machine_code ||
                String(Date.now()),
              title: data.type,
              message:
                data.message || data.reason || data.item || JSON.stringify(data).slice(0, 200),
              type: "info",
              module: (data.type || "").split(".")[0],
              created_at: new Date().toISOString(),
            };

            if (data.type === "wrong_destination") {
              setLastWrongDestination(data as WrongDestinationPayload);
            }

            setNotifications((prev) => [notif, ...prev].slice(0, 50));
            setUnreadCount((prev) => prev + 1);
          } catch {
            // silently drop malformed messages
          }
        };
      } catch {
        // silently abort if WebSocket construction fails (e.g. bad URL, no network)
      }
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

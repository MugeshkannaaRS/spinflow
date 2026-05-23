import { useState, useEffect, useRef, useCallback } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { X, AlertTriangle } from "lucide-react";

interface Alert {
  id: number;
  type: "machine_breakdown" | "low_stock" | "wrong_destination";
  payload: Record<string, unknown>;
}

export function AlertBanner() {
  const { lastMessage, lastWrongDestination } = useWebSocket();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [wrongDestAlerts, setWrongDestAlerts] = useState<Alert[]>([]);
  const alertIdRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissWrongDest = useCallback((id: number) => {
    setWrongDestAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === "machine_breakdown") {
      const id = ++alertIdRef.current;
      const payload = lastMessage.payload as unknown as Record<string, unknown>;
      setAlerts((prev) => {
        const next: Alert = { id, type: "machine_breakdown" as const, payload };
        return [next, ...prev].slice(0, 3);
      });
      const timer = setTimeout(() => dismiss(id), 30000);
      timersRef.current.set(id, timer);
    }

    if (lastMessage.type === "low_stock") {
      const id = ++alertIdRef.current;
      const payload = lastMessage.payload as unknown as Record<string, unknown>;
      setAlerts((prev) => {
        const next: Alert = { id, type: "low_stock" as const, payload };
        return [next, ...prev].slice(0, 3);
      });
      const timer = setTimeout(() => dismiss(id), 20000);
      timersRef.current.set(id, timer);
    }
  }, [lastMessage, dismiss]);

  useEffect(() => {
    if (lastWrongDestination) {
      const id = ++alertIdRef.current;
      setWrongDestAlerts((prev) => {
        const next: Alert = {
          id,
          type: "wrong_destination",
          payload: lastWrongDestination as unknown as Record<string, unknown>,
        };
        return [next, ...prev].slice(0, 3);
      });
    }
  }, [lastWrongDestination]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  if (alerts.length === 0 && wrongDestAlerts.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex flex-col items-center pt-2 pointer-events-none">
      <div className="w-full max-w-2xl space-y-2 pointer-events-auto">
        {wrongDestAlerts.map((alert) => {
          const p = alert.payload as { trip_no?: string; bag_no?: string; lot_no?: string; expected_route?: string; actual_route?: string };
          return (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-md bg-destructive px-4 py-4 text-destructive-foreground shadow-lg animate-slide-in border-2 border-red-400"
            >
              <AlertTriangle className="size-6 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-base font-bold">⚠️ WRONG DESTINATION DETECTED</p>
                <p className="text-sm mt-1">
                  Trip: {p.trip_no} — Bag: {p.bag_no} (Lot: {p.lot_no})
                </p>
                <p className="text-sm">
                  Expected route: {p.expected_route} → Scanned at: {p.actual_route}
                </p>
              </div>
              <button
                onClick={() => dismissWrongDest(alert.id)}
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="size-5" />
              </button>
            </div>
          );
        })}
        {alerts.map((alert) => {
          if (alert.type === "machine_breakdown") {
            const p = alert.payload as { machine_no?: string; reason?: string; timestamp?: string };
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-md bg-destructive px-4 py-3 text-destructive-foreground shadow-lg animate-slide-in"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    Machine {p.machine_no || "Unknown"} breakdown — {p.reason || "No reason"}
                  </p>
                  {p.timestamp && <p className="text-xs mt-0.5 opacity-80">{p.timestamp}</p>}
                </div>
                <button
                  onClick={() => dismiss(alert.id)}
                  className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          }

          if (alert.type === "low_stock") {
            const p = alert.payload as {
              item_name?: string;
              current_stock?: number;
              reorder_level?: number;
            };
            return (
              <div
                key={alert.id}
                className="flex items-start gap-3 rounded-md bg-warning px-4 py-3 text-warning-foreground shadow-lg animate-slide-in"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {p.item_name || "Item"} stock low — {p.current_stock ?? "?"} remaining (reorder
                    at {p.reorder_level ?? "?"})
                  </p>
                </div>
                <button
                  onClick={() => dismiss(alert.id)}
                  className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}

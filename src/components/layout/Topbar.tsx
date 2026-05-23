import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { ROLE_LABELS } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Bell, Menu, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/SidebarContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { formatRelativeTime } from "@/utils/time";
import { cn } from "@/lib/utils";

const TYPE_COLORS: Record<string, string> = {
  success: "bg-success",
  info: "bg-primary",
  warning: "bg-warning",
  error: "bg-destructive",
};

function NotificationsDropdown() {
  const { unreadCount, notifications, markAllRead } = useWebSocket();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggle = () => {
    setOpen((prev) => {
      if (!prev) markAllRead();
      return !prev;
    });
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" className="relative" onClick={handleToggle}>
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-md border bg-popover shadow-md z-50">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
              <BellOff className="size-8" />
              <span className="text-sm">No new alerts</span>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-3 py-2.5 text-sm border-b last:border-0 hover:bg-accent/50 transition-colors"
                >
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      TYPE_COLORS[n.type] || "bg-muted-foreground",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{n.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.message.length > 60 ? n.message.slice(0, 60) + "…" : n.message}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(n.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Topbar({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  const { user } = useAuth();
  const { toggle } = useSidebar();
  return (
    <header className="flex items-center justify-between border-b bg-card px-4 sm:px-6 py-4 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={toggle}>
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
      <div className="flex items-center gap-3 shrink-0">
        {user && (
          <>
            <NotificationsDropdown />
            <Badge variant="secondary" className="font-normal hidden sm:inline-flex">
              {ROLE_LABELS[user.role]}
            </Badge>
            <div className="size-8 sm:size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
          </>
        )}
      </div>
    </header>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import {
  Bell,
  Menu,
  BellOff,
  Moon,
  Sun,
  LogOut,
  User,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/layout/SidebarContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { formatRelativeTime } from "@/utils/time";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

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

export function Topbar({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex items-center justify-between h-14 bg-[var(--bg-primary)] border-b border-[var(--border)] shadow-[0_1px_2px_rgba(0,0,0,0.05)] px-4 lg:px-6 gap-3 sticky top-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="icon" className="lg:hidden shrink-0" onClick={toggle}>
          <Menu className="size-5" />
        </Button>
        <div className="min-w-0 flex items-center gap-2">
          <h1 className="text-base font-semibold text-[var(--text-primary)] truncate">{title}</h1>
          {subtitle && (
            <>
              <span className="text-xs text-[var(--text-muted)] hidden sm:inline">·</span>
              <span className="text-xs text-[var(--text-muted)] truncate hidden sm:inline">{subtitle}</span>
            </>
          )}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground">
          {theme === "light" ? <Moon className="size-5" /> : <Sun className="size-5" />}
        </Button>
        <NotificationsDropdown />
        <div className="h-6 w-px bg-border" />
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center hover:bg-indigo-700 transition-colors"
            >
              {user.name?.charAt(0)?.toUpperCase() ?? "U"}
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                  <span className="inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                    {user.role.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="py-1">
                  <button
                    onClick={() => { navigate({ to: "/profile" }); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <User className="w-4 h-4 text-gray-400" /> Profile
                  </button>
                  <button
                    onClick={() => { navigate({ to: "/change-password" }); setDropdownOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-gray-400" /> Change Password
                  </button>
                  <div className="h-px bg-gray-100 dark:bg-slate-700 mx-3 my-1" />
                  <button
                    onClick={() => { logout(); navigate({ to: "/login" }); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

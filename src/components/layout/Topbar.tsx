import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import { useSidebar } from "@/components/layout/SidebarContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useNavigate, Link } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Menu,
  Moon,
  Sun,
  LogOut,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/time";

const TYPE_COLORS: Record<string, string> = {
  success: "bg-emerald-500",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
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
      <button
        onClick={handleToggle}
        className="relative w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
              <BellOff className="w-8 h-8" />
              <span className="text-sm">No new alerts</span>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-2.5 text-sm border-b last:border-0 border-gray-50 hover:bg-gray-50 transition-colors"
                >
                  <span
                    className={cn(
                      "mt-1.5 w-2 h-2 shrink-0 rounded-full",
                      TYPE_COLORS[n.type] || "bg-gray-300",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {n.message.length > 60 ? n.message.slice(0, 60) + "…" : n.message}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 whitespace-nowrap">
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
  title = "SpinFlow",
  subtitle,
  children,
}: {
  title?: string;
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

  const initials =
    user?.name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "U";

  const handleLogout = () => {
    logout();
    navigate({ to: "/login" });
  };

  return (
    <header className="sticky top-0 z-30 h-14 bg-white border-b border-gray-100 flex items-center px-4 lg:px-6 gap-3">
      {/* Left */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={toggle}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold text-gray-900 truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs text-gray-400 truncate hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      {children && <div className="flex items-center gap-2">{children}</div>}

      {/* Right */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <NotificationsDropdown />

        {user && (
          <div className="hidden sm:flex items-center px-3 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
            {user.role.replace(/_/g, " ")}
          </div>
        )}

        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#0d9488" }}
            >
              {initials}
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-100 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <User className="w-4 h-4 text-gray-400" /> Profile
                    </Link>
                    <button
                      onClick={() => { toggleTheme(); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {theme === "dark"
                        ? <Sun className="w-4 h-4 text-gray-400" />
                        : <Moon className="w-4 h-4 text-gray-400" />
                      }
                      {theme === "dark" ? "Light Mode" : "Dark Mode"}
                    </button>
                    <div className="h-px bg-gray-100 mx-3 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
                    >
                      <LogOut className="w-4 h-4" /> Logout
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

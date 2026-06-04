import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import { useSidebar } from "@/components/layout/SidebarContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellOff,
  Menu,
  Moon,
  Sun,
  LogOut,
  User,
  Building2,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/utils/time";
import { useActiveMill } from "@/hooks/useActiveMill";

// Role → badge color (matches Sidebar)
const ROLE_BADGE_COLORS: Record<string, string> = {
  SUPER_ADMIN:          "bg-purple-100 text-purple-700",
  MILL_OWNER:           "bg-blue-100 text-blue-700",
  GENERAL_MANAGER:      "bg-cyan-100 text-cyan-700",
  PRODUCTION_MANAGER:   "bg-green-100 text-green-700",
  QUALITY_MANAGER:      "bg-yellow-100 text-yellow-700",
  DISPATCH_MANAGER:     "bg-orange-100 text-orange-700",
  HR_MANAGER:           "bg-pink-100 text-pink-700",
  ACCOUNTANT:           "bg-indigo-100 text-indigo-700",
  MAINTENANCE_MANAGER:  "bg-red-100 text-red-700",
  STORE_MANAGER:        "bg-teal-100 text-teal-700",
  SUPERVISOR:           "bg-slate-100 text-slate-600",
  MACHINE_OPERATOR:     "bg-slate-100 text-slate-500",
  SECURITY_GATE:        "bg-slate-100 text-slate-500",
  AUDITOR:              "bg-slate-100 text-slate-500",
};

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/dashboard":          { title: "Dashboard",        subtitle: "Live operations overview" },
  "/production":         { title: "Production",        subtitle: "Daily output & efficiency" },
  "/quality":            { title: "Quality",           subtitle: "Tests & approvals" },
  "/maintenance":        { title: "Maintenance",       subtitle: "Machine upkeep & logs" },
  "/hr":                 { title: "Human Resources",   subtitle: "Employees & attendance" },
  "/payroll":            { title: "Payroll",           subtitle: "Monthly salary processing" },
  "/purchase":           { title: "Cotton Purchase",   subtitle: "Procurement & suppliers" },
  "/stores":             { title: "Stores",            subtitle: "Receipts, issues & balance" },
  "/inventory":          { title: "Inventory",         subtitle: "Stock levels & reorder" },
  "/dispatch":           { title: "Dispatch",          subtitle: "Trips, trucks & delivery" },
  "/lotrac":             { title: "LoTrac",            subtitle: "QR sack tracking" },
  "/accounts":           { title: "Accounts",          subtitle: "Invoices & receivables" },
  "/sales":              { title: "Sales",             subtitle: "Orders & revenue" },
  "/masters":            { title: "Masters",           subtitle: "Reference data & config" },
  "/users":              { title: "Users & Roles",     subtitle: "Access management" },
  "/audit":              { title: "Audit Logs",        subtitle: "Activity history" },
  "/admin":              { title: "Admin Panel",       subtitle: "System administration" },
  "/admin/column-config":{ title: "Column Config",     subtitle: "Field customization" },
  "/company/billing":    { title: "Billing",           subtitle: "Subscription & payments" },
  "/profile":            { title: "My Profile",        subtitle: "Account settings" },
  "/reports":            { title: "Reports",           subtitle: "Analytics & exports" },
  "/stock":              { title: "Stock",             subtitle: "Lot & warehouse tracking" },
};

const TYPE_COLORS: Record<string, string> = {
  success: "bg-emerald-500",
  info:    "bg-blue-500",
  warning: "bg-amber-500",
  error:   "bg-red-500",
};

function NotificationsDropdown() {
  const { unreadCount, notifications, markAllRead } = useWebSocket();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        title="Notifications"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-2.5 text-xs font-semibold text-gray-500 border-b border-gray-100 flex items-center justify-between">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unreadCount}</span>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-gray-400">
              <BellOff className="w-8 h-8" />
              <span className="text-sm">No new alerts</span>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
                >
                  <span className={cn("mt-1.5 w-2 h-2 shrink-0 rounded-full", TYPE_COLORS[n.type] || "bg-gray-300")} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{n.title}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
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
  title: titleProp,
  subtitle: subtitleProp,
  children,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  const { user, logout, activeMill, setActiveMill } = useAuth();
  const { mills } = useActiveMill();
  const { toggle } = useSidebar();
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [millDropdownOpen, setMillDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const millDropdownRef = useRef<HTMLDivElement>(null);

  // Close mill dropdown on outside click
  useEffect(() => {
    if (!millDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (millDropdownRef.current && !millDropdownRef.current.contains(e.target as Node)) {
        setMillDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [millDropdownOpen]);

  const showMillSwitcher =
    (user?.role === "MILL_OWNER" || user?.role === "GENERAL_MANAGER") &&
    mills.length > 1;

  // Derive page title from route path, falling back to the prop or default
  const pagePath = location.pathname;
  // Find longest matching prefix in PAGE_TITLES
  const matched = Object.entries(PAGE_TITLES)
    .filter(([k]) => pagePath === k || pagePath.startsWith(k + "/"))
    .sort((a, b) => b[0].length - a[0].length)[0];
  const pageInfo = matched?.[1] ?? { title: "SpinFlow ERP", subtitle: "" };
  const title = titleProp ?? pageInfo.title;
  const subtitle = subtitleProp ?? pageInfo.subtitle;

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

  const roleBadgeClass = ROLE_BADGE_COLORS[user?.role ?? ""] ?? "bg-slate-100 text-slate-600";
  const roleLabel = user?.role?.replace(/_/g, " ") ?? "";

  return (
    <header
      className="sticky top-0 z-30 bg-white border-b border-gray-200 flex items-center px-4 lg:px-6 gap-3"
      style={{ height: 56, minHeight: 56 }}
    >
      {/* Hamburger (mobile only) */}
      <button
        onClick={toggle}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[18px] font-bold text-[#0f172a] truncate leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-[12px] text-[#64748b] truncate hidden sm:block leading-tight">{subtitle}</p>
        )}
      </div>

      {children && <div className="flex items-center gap-2">{children}</div>}

      {/* Right cluster */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Mill switcher — only for MILL_OWNER / GM with 2+ mills */}
        {showMillSwitcher && (
          <div className="relative hidden sm:block" ref={millDropdownRef}>
            <button
              onClick={() => setMillDropdownOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] transition-colors"
            >
              <Building2 className="w-4 h-4 text-[#64748b] shrink-0" />
              <span className="text-[13px] font-medium text-[#0f172a] max-w-[120px] truncate">
                {activeMill?.name ?? "Select Mill"}
              </span>
              <ChevronDown className="w-4 h-4 text-[#94a3b8] shrink-0" />
            </button>
            {millDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-[#e2e8f0] rounded-xl shadow-lg overflow-hidden min-w-[200px]">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8] border-b border-[#f1f5f9]">
                  Switch Mill
                </div>
                {mills.map(m => {
                  const isActive = activeMill?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setActiveMill(m);
                        qc.invalidateQueries();
                        setMillDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#f8fafc] transition-colors text-left"
                    >
                      <span className="font-mono text-[11px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-semibold shrink-0">
                        {m.code || m.name.slice(0, 3).toUpperCase()}
                      </span>
                      <span className={cn("flex-1 text-[13px] truncate", isActive ? "font-semibold text-[#0f172a]" : "text-[#374151]")}>
                        {m.name}
                      </span>
                      {isActive && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <NotificationsDropdown />

        {/* Role chip — hidden on very small screens */}
        {user && (
          <div className={cn(
            "hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide",
            roleBadgeClass,
          )}>
            {roleLabel}
          </div>
        )}

        {/* Avatar + dropdown */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-9 h-9 rounded-full text-white text-xs font-bold flex items-center justify-center hover:opacity-90 transition-opacity shadow-sm"
              style={{ backgroundColor: "#3b82f6" }}
              aria-label="User menu"
            >
              {initials}
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                    <div className="mt-2">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide", roleBadgeClass)}>
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  <div className="py-1">
                    <Link
                      to="/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <User className="w-4 h-4 text-gray-400" />
                      <span>My Profile</span>
                    </Link>
                    <button
                      onClick={() => { toggleTheme(); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      {theme === "dark"
                        ? <Sun className="w-4 h-4 text-gray-400" />
                        : <Moon className="w-4 h-4 text-gray-400" />
                      }
                      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                    </button>
                    <div className="h-px bg-gray-100 mx-3 my-1" />
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
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

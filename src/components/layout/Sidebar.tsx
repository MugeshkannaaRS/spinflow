import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { MODULE_ACCESS, ROLE_LABELS, type Module } from "@/lib/rbac";
import {
  LayoutDashboard,
  Factory,
  FlaskConical,
  Package,
  Truck,
  ShoppingCart,
  Warehouse,
  Users,
  Receipt,
  Wrench,
  ShieldCheck,
  FileText,
  LogOut,
  Boxes,
  BarChart3,
  Database,
  X,
  ClipboardList,
  MapPin,
  IndianRupee,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: Array<{
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module: Module;
  superAdminOnly?: boolean;
}> = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
  { to: "/production", label: "Production", icon: Factory, module: "production" },
  { to: "/quality", label: "Quality", icon: FlaskConical, module: "quality" },
  { to: "/stock", label: "Stock", icon: ClipboardList, module: "stock" },
  { to: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { to: "/lotrac", label: "LoTrac", icon: MapPin, module: "lotrac" },
  { to: "/dispatch", label: "Dispatch", icon: Truck, module: "dispatch" },
  { to: "/purchase", label: "Cotton Purchase", icon: ShoppingCart, module: "purchase" },
  { to: "/stores", label: "Stores", icon: Warehouse, module: "stores" },
  { to: "/hr", label: "HR", icon: Users, module: "hr" },
  { to: "/payroll", label: "Payroll", icon: IndianRupee, module: "payroll" },
  { to: "/accounts", label: "Accounts", icon: Receipt, module: "accounts" },
  { to: "/maintenance", label: "Maintenance", icon: Wrench, module: "maintenance" },
  { to: "/users", label: "Users & Roles", icon: ShieldCheck, module: "users" },
  { to: "/audit", label: "Audit Logs", icon: FileText, module: "audit" },
  { to: "/masters", label: "Masters", icon: Database, module: "masters" },
  { to: "/reports", label: "Reports", icon: BarChart3, module: "reports" },
  { to: "/admin/column-config", label: "Column Config", icon: Settings, module: "masters", superAdminOnly: true },
];

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!user) return null;

  const items = NAV.filter((n) => {
    if (n.superAdminOnly && user.role !== "SUPER_ADMIN") return false;
    const allowedByRole = MODULE_ACCESS[user?.role] ?? ["dashboard"];
    const allowedByCompany = user?.allowedModules ?? allowedByRole;
    return allowedByRole.includes(n.module) && allowedByCompany.includes(n.module);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
            S
          </div>
          <div>
            <div className="font-semibold text-sidebar-accent-foreground leading-tight">
              SpinFlow ERP
            </div>
            <div className="text-[11px] text-sidebar-foreground/70 leading-tight">
              {user.millName}
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavClick}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-sidebar-border p-3 flex-shrink-0">
        <div className="px-2 pb-2">
          <div className="text-sm font-medium text-sidebar-accent-foreground">{user.name}</div>
          <div className="text-xs text-sidebar-foreground/70">{ROLE_LABELS[user.role]}</div>
        </div>
        <button
          onClick={() => {
            logout();
            navigate({ to: "/login" });
          }}
          className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground transition-colors"
        >
          <LogOut className="size-4 shrink-0" /> Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  return (
    <>
      <aside className="fixed top-0 left-0 h-screen w-64 flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border z-30">
        <SidebarContent />
      </aside>

      {open !== undefined && (
        <div
          className={cn(
            "fixed inset-0 z-50 md:hidden",
            open ? "visible" : "invisible pointer-events-none",
          )}
        >
          <div
            className="absolute inset-0 bg-black/60 transition-opacity duration-200"
            style={{ opacity: open ? 1 : 0 }}
            onClick={onClose}
          />
          <div
            className={cn(
              "absolute left-0 top-0 h-full w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-transform duration-200",
            )}
            style={{ transform: open ? "translateX(0)" : "translateX(-100%)" }}
          >
            <button
              onClick={onClose}
              className="absolute right-3 top-4 p-1 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 md:hidden"
            >
              <X className="size-5" />
            </button>
            <SidebarContent onNavClick={onClose} />
          </div>
        </div>
      )}
    </>
  );
}

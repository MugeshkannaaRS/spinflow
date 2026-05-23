import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  MapPin,
  Factory,
  FlaskConical,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/lotrac", label: "LoTrac", icon: MapPin },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/quality", label: "Quality", icon: FlaskConical },
  { to: null, label: "Menu", icon: Grid3X3 },
];

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 border-t border-slate-700 lg:hidden pb-safe">
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.to
            ? pathname === item.to || pathname.startsWith(item.to + "/")
            : false;
          return (
            <Link
              key={item.label}
              to={item.to ?? "/dashboard"}
              className={cn(
                "flex flex-col items-center justify-center min-w-[56px] h-full px-3",
                active ? "text-blue-400" : "text-slate-400",
              )}
              style={{ minHeight: 48 }}
            >
              <Icon className="size-5 mb-0.5" />
              <span className="text-[10px] leading-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

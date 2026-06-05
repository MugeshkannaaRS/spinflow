import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Factory, SlidersHorizontal, CreditCard, Archive, FileText, Blocks, Shield, Users } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({ meta: [{ title: "Admin — SpinFlow ERP" }] }),
  component: AdminPage,
});

const SECTIONS = [
  { id: "companies", label: "Companies", icon: Building2, desc: "Manage companies, plans, and modules", color: "bg-blue-50 text-blue-600" },
  { id: "mills", label: "Mills", icon: Factory, desc: "View and manage mills across companies", color: "bg-indigo-50 text-indigo-600" },
  { id: "users", label: "Users", icon: Users, desc: "Provision, manage, and enforce user limits", color: "bg-green-50 text-green-600" },
  { id: "organizations", label: "Organizations", icon: Shield, desc: "Company overview, usage, and limits", color: "bg-teal-50 text-teal-600" },
  { id: "modules", label: "Module Manager", icon: Blocks, desc: "Toggle module access per company", color: "bg-purple-50 text-purple-600" },
  { id: "limits", label: "User Limits", icon: SlidersHorizontal, desc: "Monitor and adjust user limits", color: "bg-amber-50 text-amber-600" },
  { id: "audit", label: "Audit Logs", icon: FileText, desc: "View audit trail across all companies", color: "bg-rose-50 text-rose-600" },
  { id: "billing", label: "Billing", icon: CreditCard, desc: "Subscriptions, invoicing, plans, and revenue analytics", color: "bg-teal-50 text-teal-600" },
  { id: "archive", label: "Archive", icon: Archive, desc: "View and restore suspended companies", color: "bg-gray-50 text-gray-600" },
  { id: "column-config", label: "Column Config", icon: SlidersHorizontal, desc: "Configure table column visibility", color: "bg-orange-50 text-orange-600" },
];

function AdminPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/admin";

  const statsQ = useQuery({
    queryKey: ["admin-global-stats"],
    queryFn: () => adminApi.getGlobalStats(),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  if (isChildRoute) {
    return <Outlet />;
  }

  const stats = statsQ.data;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage companies, users, and system configuration</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_companies ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Mills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_mills ?? "..."}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total_users ?? "..."}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SECTIONS.map(s => (
          <button key={s.id} onClick={() => navigate({ to: `/admin/${s.id}` })}
            className="text-left p-4 rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all bg-white dark:bg-slate-900 dark:border-slate-700"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color} mb-3`}>
              <s.icon className="size-5" />
            </div>
            <h3 className="font-semibold text-sm">{s.label}</h3>
            <p className="text-xs text-muted-foreground mt-1">{s.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

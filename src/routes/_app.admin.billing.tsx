import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CreditCard, Receipt, DollarSign, TrendingUp, Building2,
  AlertTriangle, Users as UsersIcon, CheckCircle2, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/billing")({
  head: () => ({ meta: [{ title: "Billing — Admin — SpinFlow ERP" }] }),
  component: BillingPage,
});

const SECTIONS = [
  { id: "subscriptions", label: "Subscriptions", icon: Building2, desc: "View and manage company subscriptions", color: "bg-blue-50 text-blue-600" },
  { id: "invoices", label: "Invoices", icon: Receipt, desc: "All invoices across companies", color: "bg-indigo-50 text-indigo-600" },
  { id: "payments", label: "Payments", icon: DollarSign, desc: "Payment records and history", color: "bg-green-50 text-green-600" },
  { id: "plans", label: "Plans", icon: CreditCard, desc: "Manage subscription plans and pricing", color: "bg-purple-50 text-purple-600" },
  { id: "analytics", label: "Analytics", icon: TrendingUp, desc: "Revenue metrics, MRR, ARR, churn", color: "bg-amber-50 text-amber-600" },
];

function BillingPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/admin/billing";

  const summaryQ = useQuery({
    queryKey: ["admin-billing-summary"],
    queryFn: () => adminApi.getBillingSummary(),
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

  const d = summaryQ.data;

  const kpis = [
    { label: "MRR", value: d ? `₹${(d.mrr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", icon: TrendingUp, color: "text-blue-600", sub: "Monthly Recurring Revenue" },
    { label: "ARR", value: d ? `₹${(d.arr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—", icon: DollarSign, color: "text-green-600", sub: "Annual Recurring Revenue" },
    { label: "Active", value: String(d?.active_subscriptions ?? "—"), icon: CheckCircle2, color: "text-emerald-600", sub: "Active subscriptions" },
    { label: "Overdue", value: String(d?.overdue_count ?? "—"), icon: AlertTriangle, color: "text-red-600", sub: "Overdue accounts" },
    { label: "Trial", value: String(d?.trial_count ?? "—"), icon: UsersIcon, color: "text-amber-600", sub: "Trial accounts" },
    { label: "Collection", value: d ? `${d.collection_rate ?? 0}%` : "—", icon: CheckCircle2, color: "text-purple-600", sub: "Collection rate" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Commercial control center — subscriptions, invoicing, and revenue analytics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                  <p className="text-lg font-bold mt-0.5 truncate">{k.value}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{k.sub}</p>
                </div>
                <k.icon className={`size-7 shrink-0 ${k.color} opacity-80`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {SECTIONS.map((s) => (
          <button key={s.id} onClick={() => navigate({ to: `/admin/billing/${s.id}` })}
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

import { createFileRoute, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import {
  CreditCard,
  Receipt,
  DollarSign,
  TrendingUp,
  Building2,
  AlertTriangle,
  Users as UsersIcon,
  CheckCircle2,
  ArrowUpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/billing")({
  head: () => ({ meta: [{ title: "Billing — Admin — SpinFlow ERP" }] }),
  component: BillingPage,
});

const SECTIONS = [
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: Building2,
    desc: "View and manage company subscriptions",
    color: "bg-blue-50 text-blue-600",
  },
  {
    id: "upgrade-requests",
    label: "Upgrade Requests",
    icon: ArrowUpCircle,
    desc: "Review and approve plan upgrade requests",
    color: "bg-orange-50 text-orange-600",
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: Receipt,
    desc: "All invoices across companies",
    color: "bg-indigo-50 text-indigo-600",
  },
  {
    id: "payments",
    label: "Payments",
    icon: DollarSign,
    desc: "Payment records and history",
    color: "bg-green-50 text-green-600",
  },
  {
    id: "plans",
    label: "Plans",
    icon: CreditCard,
    desc: "Manage subscription plans and pricing",
    color: "bg-purple-50 text-purple-600",
  },
  {
    id: "analytics",
    label: "Analytics",
    icon: TrendingUp,
    desc: "Revenue metrics, MRR, ARR, churn",
    color: "bg-amber-50 text-amber-600",
  },
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
    return (
      <ErrorBoundary>
        <Outlet />
      </ErrorBoundary>
    );
  }

  if (summaryQ.isError) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Commercial control center — subscriptions, invoicing, and revenue analytics.
          </p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-8 text-center">
          <AlertTriangle className="size-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Failed to load billing summary.
          </p>
          <p className="text-xs text-red-500 mt-1 mb-3">
            {(summaryQ.error as any)?.response?.data?.detail ??
              (summaryQ.error as any)?.message ??
              "Request failed"}
          </p>
          <Button variant="outline" size="sm" onClick={() => summaryQ.refetch()}>
            Retry
          </Button>
        </div>
        <SectionGrid />
      </div>
    );
  }

  const d = summaryQ.data;

  const kpis = [
    ...(summaryQ.isLoading
      ? Array.from({ length: 6 }).map((_, i) => ({
          label: "",
          value: "—",
          icon: TrendingUp,
          color: "text-muted-foreground",
          sub: "",
          key: i,
        }))
      : [
          {
            label: "MRR",
            value: `₹${(d!.mrr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            icon: TrendingUp,
            color: "text-blue-600",
            sub: "Monthly Recurring Revenue",
          },
          {
            label: "ARR",
            value: `₹${(d!.arr ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
            icon: DollarSign,
            color: "text-green-600",
            sub: "Annual Recurring Revenue",
          },
          {
            label: "Active",
            value: String(d!.active_subscriptions ?? 0),
            icon: CheckCircle2,
            color: "text-emerald-600",
            sub: "Active subscriptions",
          },
          {
            label: "Overdue",
            value: String(d!.overdue_count ?? 0),
            icon: AlertTriangle,
            color: "text-red-600",
            sub: "Overdue accounts",
          },
          {
            label: "Trial",
            value: String(d!.trial_count ?? 0),
            icon: UsersIcon,
            color: "text-amber-600",
            sub: "Trial accounts",
          },
          {
            label: "Collection",
            value: `${d!.collection_rate ?? 0}%`,
            icon: CheckCircle2,
            color: "text-purple-600",
            sub: "Collection rate",
          },
        ]),
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Commercial control center — subscriptions, invoicing, and revenue analytics.
        </p>
      </div>

      {summaryQ.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-3 w-14 bg-muted rounded animate-pulse mb-2" />
                <div className="h-6 w-20 bg-muted rounded animate-pulse mt-1" />
                <div className="h-2 w-24 bg-muted rounded animate-pulse mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k: any) => (
            <Card key={k.key ?? k.label}>
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
      )}

      <SectionGrid />
    </div>
  );
}

function SectionGrid() {
  const navigate = useNavigate();
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate({ to: `/admin/billing/${s.id}` })}
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
  );
}

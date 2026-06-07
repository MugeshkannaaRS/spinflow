import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, AlertTriangle, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/billing/subscriptions")({
  head: () => ({ meta: [{ title: "Subscriptions — Billing — SpinFlow ERP" }] }),
  component: SubscriptionsPage,
});

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  growth: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  professional: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  business: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  unlimited: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  trial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  overdue: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  suspended: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function SubscriptionsPage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin-billing-subscriptions", search],
    queryFn: () => adminApi.getSubscriptions({ search: search || undefined, page_size: 100 }),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const rows: any[] = q.data?.items ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground">All company subscriptions with usage and billing status.</p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search company..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
      </div>

      {q.isLoading ? (
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">Loading subscriptions…</div>
      ) : q.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-6 text-center">
          <AlertTriangle className="size-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to load subscriptions.</p>
          <p className="text-xs text-red-500 mt-1 mb-3">{(q.error as any)?.response?.data?.detail ?? (q.error as any)?.message ?? "Request failed"}</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Users</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Mills</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Modules</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Renewal</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No subscriptions found.</td></tr>
              ) : rows.map((r: any) => (
                <tr key={r.company_id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.company_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.company_code}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                      PLAN_COLORS[r.plan_code] ?? PLAN_COLORS.starter,
                    )}>
                      {r.plan_name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={r.user_count >= r.user_limit ? "text-red-600 font-semibold" : ""}>{r.user_count}</span>
                      <span className="text-muted-foreground">/ {r.user_limit}</span>
                      {r.user_count >= r.user_limit && <AlertTriangle className="size-3.5 text-red-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span>{r.mill_count}</span>
                    <span className="text-muted-foreground"> / {r.mill_limit}</span>
                  </td>
                  <td className="px-4 py-3">{r.modules_enabled}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.renewal_date ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">₹{(r.monthly_amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                      STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600",
                    )}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Button variant="ghost" size="sm" className="text-xs"
                      onClick={() => navigate({ to: `/admin/billing/subscriptions/${r.company_id}` })}>
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import {
  Bell, AlertTriangle, XCircle, CheckCircle2,
  Clock, DollarSign, Users, Factory, UserCog,
  ShoppingCart, Ban, Loader2, CircleAlert,
  ArrowUpDown, Filter,
} from "lucide-react";

export const Route = createFileRoute("/_app/admin/alerts")({
  head: () => ({ meta: [{ title: "Alert Center — Admin — SpinFlow ERP" }] }),
  component: AlertCenterPage,
});

type AlertItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: "critical" | "warning" | "info";
  timestamp: string | null;
  company_name?: string;
  company_id?: string;
  acknowledged?: boolean;
};

function AlertIcon({ type }: { type: string }) {
  const icons: Record<string, any> = {
    invoice_due: DollarSign, invoice_overdue: XCircle, failed_payment: AlertTriangle,
    subscription_expiring: Clock, user_limit: Users, mill_limit: Factory,
    employee_limit: UserCog, company_suspended: Ban, upgrade_request: ShoppingCart,
    overage_purchase: ShoppingCart,
  };
  const Icon = icons[type] ?? Bell;
  return <Icon className="size-4" />;
}

function AlertPriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    info: "bg-blue-100 text-blue-700",
  };
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${map[priority] ?? map.info}`}>{priority}</span>;
}

function AlertCenterPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [filter, setFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const invoicesQ = useQuery({
    queryKey: ["admin-alerts-invoices"],
    queryFn: () => api.get("/admin/billing/invoices", { params: { page_size: 100 } }).then(r => r.data),
    staleTime: 30_000,
  });

  const dashboardQ = useQuery({
    queryKey: ["admin-billing-dashboard"],
    queryFn: () => api.get("/admin/billing/dashboard").then(r => r.data),
    staleTime: 30_000,
  });

  const subsQ = useQuery({
    queryKey: ["admin-subscriptions-enriched"],
    queryFn: () => api.get("/admin/billing/subscriptions-enriched", { params: { page_size: 100 } }).then(r => r.data),
    staleTime: 30_000,
  });

  const upgradesQ = useQuery({
    queryKey: ["admin-pending-upgrades"],
    queryFn: () => api.get("/subscription/change-requests", { params: { status: "pending" } }).then(r => r.data),
    staleTime: 30_000,
  });

  const alerts = useMemo(() => {
    const items: AlertItem[] = [];
    const now = Date.now();

    // Invoice alerts
    const invoices: any[] = Array.isArray(invoicesQ.data?.items ?? invoicesQ.data?.data ?? invoicesQ.data) ? (invoicesQ.data?.items ?? invoicesQ.data?.data ?? invoicesQ.data) : [];
    for (const inv of invoices) {
      if (inv.status === "overdue" || (inv.due_date && new Date(inv.due_date).getTime() < now && inv.status !== "paid")) {
        items.push({
          id: `inv-overdue-${inv.id}`,
          type: "invoice_overdue",
          title: "Invoice Overdue",
          description: `${inv.company_name} — ${inv.invoice_number || inv.id} for ₹${(inv.amount ?? 0).toLocaleString("en-IN")} is overdue`,
          priority: "critical",
          timestamp: inv.due_date,
          company_name: inv.company_name,
        });
      } else if (inv.due_date && inv.status === "pending") {
        const daysLeft = Math.ceil((new Date(inv.due_date).getTime() - now) / 86400000);
        if (daysLeft <= 7 && daysLeft > 0) {
          items.push({
            id: `inv-due-${inv.id}`,
            type: "invoice_due",
            title: "Invoice Due Soon",
            description: `${inv.company_name} — ${inv.invoice_number || inv.id} for ₹${(inv.amount ?? 0).toLocaleString("en-IN")} due in ${daysLeft}d`,
            priority: daysLeft <= 2 ? "warning" : "info",
            timestamp: inv.due_date,
            company_name: inv.company_name,
          });
        }
      }
    }

    // Subscription alerts
    if (dashboardQ.data) {
      const dd = dashboardQ.data;
      if (dd.suspended_companies > 0) {
        items.push({
          id: "suspended-companies",
          type: "company_suspended",
          title: "Suspended Companies",
          description: `${dd.suspended_companies} company(ies) currently suspended`,
          priority: "critical",
          timestamp: null,
        });
      }
      if (dd.overdue_companies > 0) {
        items.push({
          id: "overdue-companies",
          type: "failed_payment",
          title: "Overdue Accounts",
          description: `${dd.overdue_companies} company(ies) with overdue payments`,
          priority: "critical",
          timestamp: null,
        });
      }
    }

    // Near-limit alerts
    const subs: any[] = Array.isArray(subsQ.data?.items) ? subsQ.data.items : [];
    for (const s of subs) {
      if (s.user_count > s.user_limit) {
        items.push({
          id: `user-limit-${s.company_id}`,
          type: "user_limit",
          title: "User Limit Exceeded",
          description: `${s.company_name} — ${s.user_count}/${s.user_limit} users`,
          priority: "critical",
          timestamp: null,
          company_name: s.company_name,
          company_id: s.company_id,
        });
      } else if (s.user_count >= s.user_limit * 0.9) {
        items.push({
          id: `user-near-${s.company_id}`,
          type: "user_limit",
          title: "User Limit Nearly Reached",
          description: `${s.company_name} — ${s.user_count}/${s.user_limit} users (${Math.round(s.user_count / s.user_limit * 100)}%)`,
          priority: "warning",
          timestamp: null,
          company_name: s.company_name,
          company_id: s.company_id,
        });
      }
      if (s.mill_count > s.mill_limit) {
        items.push({
          id: `mill-limit-${s.company_id}`,
          type: "mill_limit",
          title: "Mill Limit Exceeded",
          description: `${s.company_name} — ${s.mill_count}/${s.mill_limit} mills`,
          priority: "critical",
          timestamp: null,
          company_name: s.company_name,
          company_id: s.company_id,
        });
      }
      if ((s.employee_count ?? 0) > (s.employee_limit ?? 9999)) {
        items.push({
          id: `emp-limit-${s.company_id}`,
          type: "employee_limit",
          title: "Employee Limit Exceeded",
          description: `${s.company_name} — ${s.employee_count}/${s.employee_limit} employees`,
          priority: "critical",
          timestamp: null,
          company_name: s.company_name,
          company_id: s.company_id,
        });
      }
      if (s.renewal_date) {
        const daysLeft = Math.ceil((new Date(s.renewal_date).getTime() - now) / 86400000);
        if (daysLeft > 0 && daysLeft <= 14) {
          items.push({
            id: `renew-${s.company_id}`,
            type: "subscription_expiring",
            title: "Subscription Expiring Soon",
            description: `${s.company_name} — renews in ${daysLeft} days (${new Date(s.renewal_date).toLocaleDateString("en-IN")})`,
            priority: daysLeft <= 3 ? "warning" : "info",
            timestamp: s.renewal_date,
            company_name: s.company_name,
            company_id: s.company_id,
          });
        }
      }
    }

    // Upgrade requests
    const upgrades: any[] = Array.isArray(upgradesQ.data) ? upgradesQ.data : [];
    for (const cr of upgrades) {
      items.push({
        id: `upgrade-${cr.id}`,
        type: "upgrade_request",
        title: "Plan Upgrade Request",
        description: `${cr.change_type} request — ${cr.reason || "No reason"}`,
        priority: "warning",
        timestamp: cr.created_at,
      });
    }

    // Sort: critical first, then warning, then info; then by time
    const priorityOrder = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 2;
      const pb = priorityOrder[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      if (a.timestamp && b.timestamp) return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return 0;
    });

    return items;
  }, [invoicesQ.data, dashboardQ.data, subsQ.data, upgradesQ.data]);

  const filtered = alerts.filter(a => {
    if (filter !== "all" && a.type !== filter) return false;
    if (priorityFilter !== "all" && a.priority !== priorityFilter) return false;
    return true;
  });

  const counts = useMemo(() => ({
    critical: alerts.filter(a => a.priority === "critical").length,
    warning: alerts.filter(a => a.priority === "warning").length,
    info: alerts.filter(a => a.priority === "info").length,
    total: alerts.length,
  }), [alerts]);

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const isLoading = invoicesQ.isLoading || dashboardQ.isLoading || subsQ.isLoading || upgradesQ.isLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Alert Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.total} alert{counts.total !== 1 ? "s" : ""} · {counts.critical} critical · {counts.warning} warning · {counts.info} info
          </p>
        </div>
        <button onClick={() => { qc.invalidateQueries({ queryKey: ["admin-alerts"] }); qc.invalidateQueries({ queryKey: ["admin-billing-dashboard"] }); qc.invalidateQueries({ queryKey: ["admin-subscriptions"] }); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium hover:bg-gray-50">
          <Loader2 className="size-3.5" /> Refresh
        </button>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: `All (${counts.total})`, cls: "bg-gray-100 text-gray-700" },
          { key: "critical", label: `Critical (${counts.critical})`, cls: "bg-red-100 text-red-700" },
          { key: "warning", label: `Warning (${counts.warning})`, cls: "bg-amber-100 text-amber-700" },
          { key: "info", label: `Info (${counts.info})`, cls: "bg-blue-100 text-blue-700" },
        ].map(chip => (
          <button key={chip.key} onClick={() => setPriorityFilter(chip.key === "all" ? "all" : chip.key === "All" ? "all" : chip.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${priorityFilter === chip.key || (priorityFilter === "all" && chip.key === "all") ? chip.cls + " ring-2 ring-offset-1" : "bg-gray-50 text-gray-400 hover:bg-gray-100"}`}>
            {chip.label}
          </button>
        ))}
      </div>

      {/* Alert type filter */}
      <div className="flex flex-wrap gap-2 text-xs">
        <button onClick={() => setFilter("all")} className={`px-2 py-1 rounded ${filter === "all" ? "bg-blue-100 text-blue-700 font-medium" : "text-muted-foreground hover:bg-gray-50"}`}>All Types</button>
        {["invoice_overdue", "invoice_due", "user_limit", "mill_limit", "employee_limit", "subscription_expiring", "upgrade_request", "company_suspended"].map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`px-2 py-1 rounded capitalize ${filter === t ? "bg-blue-100 text-blue-700 font-medium" : "text-muted-foreground hover:bg-gray-50"}`}>{t.replace(/_/g, " ")}</button>
        ))}
      </div>

      {/* Alert list */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="size-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium">No alerts</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filter !== "all" ? "No alerts match the selected filter." : "All systems operational."}
            </p>
          </div>
        ) : (
          filtered.map(alert => (
            <div key={alert.id}
              className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
                alert.priority === "critical" ? "bg-red-50 border-red-200" :
                alert.priority === "warning" ? "bg-amber-50 border-amber-200" :
                "bg-blue-50 border-blue-200"
              }`}>
              <div className={`mt-0.5 p-1.5 rounded-full ${
                alert.priority === "critical" ? "bg-red-100 text-red-600" :
                alert.priority === "warning" ? "bg-amber-100 text-amber-600" :
                "bg-blue-100 text-blue-600"
              }`}>
                <AlertIcon type={alert.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{alert.title}</p>
                  <AlertPriorityBadge priority={alert.priority} />
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{alert.description}</p>
                {alert.company_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">{alert.company_name}</p>
                )}
              </div>
              {alert.timestamp && (
                <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {new Date(alert.timestamp).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

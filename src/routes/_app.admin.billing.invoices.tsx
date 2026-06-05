import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/billing/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Billing — SpinFlow ERP" }] }),
  component: InvoicesPage,
});

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

function InvoicesPage() {
  const user = useAuth((s) => s.user);

  const q = useQuery({
    queryKey: ["admin-billing-invoices"],
    queryFn: () => adminApi.getBillingInvoices({ page_size: 100 }),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return <div className="p-6 text-destructive text-lg font-medium">Only Super Admin can access this page.</div>;
  }

  const rows: any[] = q.data?.items ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Invoices</h1>
        <p className="text-sm text-muted-foreground">All invoices generated across companies.</p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Issued</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paid</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">No invoices found.</td></tr>
            ) : rows.map((r: any) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{r.invoice_number}</td>
                <td className="px-4 py-3 font-medium">{r.company_name}</td>
                <td className="px-4 py-3 text-right font-medium">₹{(r.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.issue_date ? new Date(r.issue_date).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">
                  {r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize",
                    STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600",
                  )}>
                    {r.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

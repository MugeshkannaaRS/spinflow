import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/billing/payments")({
  head: () => ({ meta: [{ title: "Payments — Billing — SpinFlow ERP" }] }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const user = useAuth((s) => s.user);

  const q = useQuery({
    queryKey: ["admin-billing-payments"],
    queryFn: () => adminApi.getBillingPayments({ page_size: 100 }),
    staleTime: 30_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">Payment records and transaction history.</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-8 text-center">
          <AlertTriangle className="size-8 mx-auto mb-2 text-red-500" />
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            Failed to load payments.
          </p>
          <p className="text-xs text-red-500 mt-1 mb-3">
            {(q.error as any)?.response?.data?.detail ??
              (q.error as any)?.message ??
              "Request failed"}
          </p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (q.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">Payment records and transaction history.</p>
        </div>
        <div className="rounded-lg border p-12 text-center text-sm text-muted-foreground">
          Loading payments…
        </div>
      </div>
    );
  }

  const rows: any[] = q.data?.items ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold">Payments</h1>
        <p className="text-sm text-muted-foreground">Payment records and transaction history.</p>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Invoice</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Method</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reference</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Paid Date</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No payments found.
                </td>
              </tr>
            ) : (
              rows.map((r: any) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{r.company_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoice_number ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    ₹{(r.amount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">
                    {r.method?.replace(/_/g, " ") ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {r.reference ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.paid_date ? new Date(r.paid_date).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold",
                        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                      )}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

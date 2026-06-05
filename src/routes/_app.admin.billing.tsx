import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingDashboard } from "@/components/admin/BillingDashboard";

export const Route = createFileRoute("/_app/admin/billing")({
  head: () => ({ meta: [{ title: "Billing — Admin — SpinFlow ERP" }] }),
  component: () => (
    <div className="p-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Billing Dashboard</CardTitle></CardHeader>
        <CardContent><BillingDashboard /></CardContent>
      </Card>
    </div>
  ),
});

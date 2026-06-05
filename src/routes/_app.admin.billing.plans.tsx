import { createFileRoute } from "@tanstack/react-router";
import { PlanManager } from "@/components/admin/PlanManager";

export const Route = createFileRoute("/_app/admin/billing/plans")({
  head: () => ({ meta: [{ title: "Plans — Billing — SpinFlow ERP" }] }),
  component: () => (
    <div className="p-6">
      <PlanManager />
    </div>
  ),
});

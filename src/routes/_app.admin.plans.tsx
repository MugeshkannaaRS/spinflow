import { createFileRoute } from "@tanstack/react-router";
import { PlanManager } from "@/components/admin/PlanManager";

export const Route = createFileRoute("/_app/admin/plans")({
  head: () => ({ meta: [{ title: "Plans — Admin — SpinFlow ERP" }] }),
  component: () => (
    <div className="p-6">
      <PlanManager />
    </div>
  ),
});

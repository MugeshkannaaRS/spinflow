import { createFileRoute } from "@tanstack/react-router";
import { BillingPortal } from "@/components/billing/BillingPortal";

export const Route = createFileRoute("/_app/company/billing")({
  component: BillingPortal,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/admin/billing/invoices")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

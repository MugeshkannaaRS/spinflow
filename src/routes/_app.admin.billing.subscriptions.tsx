import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/admin/billing/subscriptions")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

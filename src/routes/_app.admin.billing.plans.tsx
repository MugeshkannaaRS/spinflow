import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/admin/billing/plans")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/admin/companies/onboard")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/company/billing")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

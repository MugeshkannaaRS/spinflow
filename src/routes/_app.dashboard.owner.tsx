import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/dashboard/owner")({
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
  component: () => null,
});

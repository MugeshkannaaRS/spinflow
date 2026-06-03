import { createFileRoute } from "@tanstack/react-router";
import { DashboardSelector } from "@/components/dashboard/DashboardSelector";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — SpinFlow ERP" }] }),
  component: Dashboard,
});

function Dashboard() {
  return <DashboardSelector />;
}

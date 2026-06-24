// Redirects to the non-nested view route
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/production/learner-allocation/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/production/learner-allocation-view/$id", params });
  },
  component: () => null,
});

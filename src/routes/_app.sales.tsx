import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/sales")({
  component: SalesRedirect,
});

function SalesRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/stock", replace: true });
  }, [navigate]);
  return null;
}

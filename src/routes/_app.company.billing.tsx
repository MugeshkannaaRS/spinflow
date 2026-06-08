import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BillingPortal } from "@/components/billing/BillingPortal";
import { Building2 } from "lucide-react";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { useAuth } from "@/stores/auth";

export const Route = createFileRoute("/_app/company/billing")({
  // SUPER_ADMIN should use /admin/billing — redirect them away
  beforeLoad: () => {
    const user = useAuth.getState().user;
    if (user?.role === "SUPER_ADMIN") {
      throw redirect({ to: "/admin/billing" });
    }
  },
  component: () => (
    <div className="flex flex-col min-h-full bg-[#f8fafc]">
      <div className="px-4 md:px-6 pt-4">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link to="/dashboard" className="hover:text-foreground flex items-center gap-1">
            <Building2 className="size-3.5" /> Dashboard
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium">Billing & Plan</span>
        </nav>
      </div>
      <ErrorBoundary>
        <BillingPortal />
      </ErrorBoundary>
    </div>
  ),
});

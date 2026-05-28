import { useAuth } from "@/stores/auth";
import { canAccess } from "@/lib/rbac";
import type { Module } from "@/lib/rbac";
import { AlertTriangle } from "lucide-react";

interface AccessGuardProps {
  module: Module;
  children: React.ReactNode;
}

export function AccessGuard({ module, children }: AccessGuardProps) {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  if (user.role === "SUPER_ADMIN") return <>{children}</>;
  const hasAccess = canAccess(user.role, module);
  if (hasAccess) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <AlertTriangle className="size-10" />
      <p className="text-lg font-medium">Access Restricted</p>
      <p className="text-sm text-center max-w-md">
        Your role ({user.role}) does not have access to this module. Contact your administrator if
        you need access.
      </p>
    </div>
  );
}

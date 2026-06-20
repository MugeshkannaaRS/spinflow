import { useRBAC } from "@/hooks/useRBAC";
import { AlertTriangle } from "lucide-react";

interface AccessGuardProps {
  module: string;
  children: React.ReactNode;
}

export function AccessGuard({ module, children }: AccessGuardProps) {
  const { canAccess } = useRBAC();
  const hasAccess = canAccess(module);
  if (hasAccess) return <>{children}</>;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <AlertTriangle className="size-10" />
      <p className="text-lg font-medium">Access Restricted</p>
      <p className="text-sm text-center max-w-md">
        Your role does not have access to this module. Contact your administrator if you need
        access.
      </p>
    </div>
  );
}

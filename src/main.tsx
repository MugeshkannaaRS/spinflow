import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { useAuth } from "./stores/auth";
import { startKeepAlive, stopKeepAlive } from "./lib/keepAlive";
import "./styles.css";

function KeepAlive({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    try {
      id = startKeepAlive();
    } catch {
      // keep-alive must never crash the app
    }
    return () => {
      if (id != null) stopKeepAlive(id);
    };
  }, []);
  return <>{children}</>;
}

/** Guards against Zustand persist rehydration race — route beforeLoad
 *  must not fire before auth state has been restored from localStorage. */
function HydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useAuth((s) => s._hasHydrated);
  if (!hydrated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KeepAlive>
      <HydrationGate>
        <RouterProvider router={router} />
      </HydrationGate>
    </KeepAlive>
  </StrictMode>,
);

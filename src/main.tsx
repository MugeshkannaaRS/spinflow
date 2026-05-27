import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KeepAlive>
      <RouterProvider router={router} />
    </KeepAlive>
  </StrictMode>,
);

import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { startKeepAlive, stopKeepAlive } from "./lib/keepAlive";
import "./styles.css";

function App() {
  useEffect(() => {
    const id = startKeepAlive();
    return () => stopKeepAlive(id);
  }, []);
  return <RouterProvider router={router} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

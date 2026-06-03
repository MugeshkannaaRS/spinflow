import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth, type AuthUser } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { AxiosError } from "axios";
import { Factory } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (useAuth.getState().user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — SpinFlow ERP" },
      {
        name: "description",
        content: "Sign in to SpinFlow ERP — spinning mill operations platform.",
      },
    ],
  }),
  component: LoginPage,
});

function mapUser(u: Record<string, unknown>): AuthUser {
  return {
    id: u.id as string,
    name: u.name as string,
    email: u.email as string,
    role: u.role as Role,
    millId: (u.mill_id as string) ?? "",
    millName: (u.mill_name as string) ?? "",
    companyId: u.company_id as string | undefined,
    mustChangePassword: u.must_change_password as boolean,
    moduleRestrictions: (u.module_restrictions as Record<string, boolean> | undefined) ?? null,
  };
}

function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.login);
  const [email, setEmail] = useState("admin@mill.spinflow");
  const [password, setPassword] = useState("Admin@1234");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const isLockedOut = failedAttempts >= 5;

  function getApiError(e: unknown): string {
    if (e instanceof AxiosError && e.response?.data?.detail) return e.response.data.detail;
    if (e instanceof AxiosError && e.response?.data?.message) return e.response.data.message;
    if (e instanceof Error) return e.message;
    return "Login failed. Please try again.";
  }

  const m = useMutation({
    mutationFn: async () => {
      const res = await api.post(
        "/auth/login",
        new URLSearchParams({ username: email, password }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 15000,
        },
      );
      return res.data;
    },
  });

  const demos = [{ id: "u1", email: "admin@mill.spinflow", role: "SUPER_ADMIN" }];

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-sidebar text-sidebar-foreground p-8 xl:p-12">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
            S
          </div>
          <span className="font-semibold text-sidebar-accent-foreground">SpinFlow ERP</span>
        </div>
        <div>
          <Factory className="size-10 mb-6 text-primary" />
          <h2 className="text-3xl font-semibold text-sidebar-accent-foreground tracking-tight">
            Run your spinning mill in real time.
          </h2>
          <p className="mt-3 text-sidebar-foreground/80 max-w-md">
            Production, quality, dispatch, inventory and people — one platform, role-aware,
            audit-ready, QR-traceable.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/60">v1.0 · SpinFlow ERP</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Use a demo account or your mill credentials.
            </p>
          </div>

          {isLockedOut && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              Too many failed attempts. Please refresh the page to try again.
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLockedOut) return;
              m.mutate(undefined, {
                onSuccess: (r) => {
                  setFailedAttempts(0);
                  setAuth(mapUser(r.user), r.access_token, r.refresh_token);
                  toast.success(`Welcome, ${r.user?.name ?? "User"}`);
                  if (r.user?.must_change_password) {
                    navigate({ to: "/change-password" });
                  } else {
                    navigate({ to: "/dashboard" });
                  }
                },
                onError: (e) => {
                  setFailedAttempts((n) => n + 1);
                  toast.error(getApiError(e));
                },
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={m.isPending || isLockedOut}>
              {m.isPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <Card>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                DEMO ACCOUNTS (password: Admin@1234)
              </div>
              <div className="max-h-56 overflow-y-auto divide-y">
                {demos.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setEmail("admin@mill.spinflow");
                      setPassword("Admin@1234");
                      // Auto-submit after setting credentials
                      setTimeout(() => {
                        m.mutate(undefined, {
                          onSuccess: (r) => {
                            setAuth(mapUser(r.user), r.access_token, r.refresh_token);
                            toast.success(`Welcome, ${r.user?.name ?? "User"}`);
                            if (r.user?.must_change_password) {
                              navigate({ to: "/change-password" });
                            } else {
                              navigate({ to: "/dashboard" });
                            }
                          },
                          onError: (e) => toast.error(getApiError(e)),
                        });
                      }, 0);
                    }}
                    className="w-full text-left py-2 hover:bg-accent rounded px-2 -mx-2 transition-colors"
                  >
                    <div className="text-sm font-medium">
                      {ROLE_LABELS[d.role as Role] ?? d.role}
                    </div>
                    <div className="text-xs text-muted-foreground">{d.email}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

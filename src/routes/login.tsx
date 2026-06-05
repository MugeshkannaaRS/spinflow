import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth, type AuthUser } from "@/stores/auth";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { AxiosError } from "axios";
import { Factory, QrCode, Users, ShieldCheck, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/login")({
  beforeLoad: () => {
    if (useAuth.getState().user) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Sign in — SpinFlow ERP" },
      { name: "description", content: "Sign in to SpinFlow ERP — spinning mill operations platform." },
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
    allowedModules: (u.enabled_modules as string[]) ?? [],
    companyMills: (u.company_mills as { id: string; name: string; code: string }[] | undefined) ?? [],
  };
}

const DEMO_ACCOUNTS = [
  {
    id: "u1",
    email: "admin@mill.spinflow",
    password: "Admin@1234",
    role: "SUPER_ADMIN",
    label: "Super Admin",
    desc: "Full access across all companies",
    color: "bg-purple-100 text-purple-700 border-purple-200",
  },
  {
    id: "u2",
    email: "owner@demo.spinflow",
    password: "Admin@1234",
    role: "MILL_OWNER",
    label: "Mill Owner",
    desc: "Full access for one company",
    color: "bg-blue-100 text-blue-700 border-blue-200",
  },
  {
    id: "u3",
    email: "hr@demo.spinflow",
    password: "Admin@1234",
    role: "HR_MANAGER",
    label: "HR Manager",
    desc: "Employees, attendance & payroll",
    color: "bg-pink-100 text-pink-700 border-pink-200",
  },
  {
    id: "u4",
    email: "prod@demo.spinflow",
    password: "Admin@1234",
    role: "PRODUCTION_MANAGER",
    label: "Production Manager",
    desc: "Machines, output & efficiency",
    color: "bg-green-100 text-green-700 border-green-200",
  },
];

const FEATURES = [
  { icon: Factory, title: "Production Tracking", desc: "Real-time machine output, efficiency, and waste monitoring across all departments." },
  { icon: QrCode,  title: "QR Dispatch & LoTrac", desc: "Scan-based bag loading, trip management and proof-of-delivery for every delivery." },
  { icon: ShieldCheck, title: "Role-Based Access", desc: "14 roles — from mill owner to gate security — each sees only what they need." },
];

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
    mutationFn: async (creds?: { email: string; password: string }) => {
      const res = await api.post(
        "/auth/login",
        new URLSearchParams({ username: creds?.email ?? email, password: creds?.password ?? password }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 15000 },
      );
      return res.data;
    },
  });

  const handleSuccess = (r: any) => {
    setFailedAttempts(0);
    setAuth(mapUser(r.user), r.access_token, r.refresh_token);
    toast.success(`Welcome back, ${r.user?.name ?? "User"}!`);
    if (r.user?.must_change_password) {
      navigate({ to: "/change-password" });
    } else {
      navigate({ to: "/dashboard" });
    }
  };

  const handleError = (e: unknown) => {
    setFailedAttempts((n) => n + 1);
    toast.error(getApiError(e));
  };

  const handleDemoLogin = (demo: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(demo.email);
    setPassword(demo.password);
    m.mutate({ email: demo.email, password: demo.password }, {
      onSuccess: handleSuccess,
      onError: handleError,
    });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr] xl:grid-cols-[55%_45%]">
      {/* ── Left panel ──────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between p-10 xl:p-14"
        style={{ backgroundColor: "#0f172a" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            S
          </div>
          <span className="text-white font-bold text-xl">SpinFlow ERP</span>
        </div>

        {/* Hero text */}
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight tracking-tight">
            Your mill.<br />In your hands.
          </h2>
          <p className="mt-4 text-[#94a3b8] text-base max-w-sm leading-relaxed">
            Production, quality, dispatch, inventory and people — one platform,
            role-aware, audit-ready, QR-traceable.
          </p>

          {/* Feature bullets */}
          <div className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <f.icon className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">{f.title}</p>
                  <p className="text-[#94a3b8] text-xs mt-0.5 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-[#475569] text-xs">
          Used by spinning mills across India · SpinFlow ERP v1.0
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div className="flex items-center justify-center p-6 lg:p-10 bg-[#f8fafc]">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">S</div>
            <span className="font-bold text-lg text-[#0f172a]">SpinFlow ERP</span>
          </div>

          <h1 className="text-[26px] font-bold text-[#0f172a] leading-tight">Sign in to SpinFlow</h1>
          <p className="text-[14px] text-[#64748b] mt-1">Use your mill credentials or a demo account below.</p>

          {/* Lockout warning */}
          {isLockedOut && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Too many failed attempts. Please refresh the page to try again.
            </div>
          )}

          {/* Login form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (isLockedOut) return;
              m.mutate(undefined, { onSuccess: handleSuccess, onError: handleError });
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label htmlFor="email" className="block text-[14px] font-semibold text-[#374151] mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={cn(
                  "w-full h-12 px-4 rounded-lg border border-[#d1d5db] bg-white text-[15px] text-[#0f172a]",
                  "placeholder-[#9ca3af] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                  "transition-colors",
                )}
                placeholder="you@yourmill.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-[14px] font-semibold text-[#374151] mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={cn(
                  "w-full h-12 px-4 rounded-lg border border-[#d1d5db] bg-white text-[15px] text-[#0f172a]",
                  "placeholder-[#9ca3af] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
                  "transition-colors",
                )}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={m.isPending || isLockedOut}
              className={cn(
                "w-full h-12 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-[15px]",
                "flex items-center justify-center gap-2 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {m.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-[#e2e8f0]" />
              <span className="text-[12px] font-semibold text-[#94a3b8] uppercase tracking-wide">
                Demo accounts
              </span>
              <div className="flex-1 h-px bg-[#e2e8f0]" />
            </div>

            <p className="text-[12px] text-[#94a3b8] text-center mb-3">
              Password for all demos: <span className="font-mono font-semibold text-[#64748b]">Admin@1234</span>
            </p>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => handleDemoLogin(demo)}
                  disabled={m.isPending}
                  className={cn(
                    "text-left p-3 rounded-lg border bg-white hover:shadow-sm transition-all",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "border-[#e2e8f0] hover:border-blue-200",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cn("inline-block rounded text-[10px] font-semibold uppercase px-1.5 py-0.5", demo.color)}>
                      {demo.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#94a3b8] leading-snug">{demo.desc}</p>
                  <p className="text-[11px] text-[#64748b] mt-1 font-mono truncate">{demo.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

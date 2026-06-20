import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Factory, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
});

function getStrength(password: string): { label: string; color: string; score: number } {
  let score = 0;
  if (password.length >= 6) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: "Weak", color: "bg-red-500", score };
  if (score === 2 || score === 3) return { label: "Medium", color: "bg-yellow-500", score };
  return { label: "Strong", color: "bg-green-500", score };
}

const requirements = [
  { label: "Min 6 characters", test: (p: string) => p.length >= 6 },
  { label: "1 uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 number", test: (p: string) => /[0-9]/.test(p) },
  { label: "1 special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function ChangePasswordPage() {
  const navigate = useNavigate();
  const user = useAuth((s) => s.user);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const strength = useMemo(() => getStrength(newPassword), [newPassword]);

  const m = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      useAuth.getState().setUser({ mustChangePassword: false });
      toast.success("Password changed successfully");
      navigate({ to: "/dashboard" as any });
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.detail ??
        e?.response?.data?.message ??
        e?.message ??
        "Failed to change password";
      if (typeof msg === "object" && msg?.message) {
        setErrorMsg(msg.message);
      } else {
        setErrorMsg(typeof msg === "string" ? msg : "Failed to change password");
      }
    },
  });

  const allReqsMet = requirements.every((r) => r.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit =
    currentPassword && newPassword && confirmPassword && allReqsMet && passwordsMatch;

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
            Update your password
          </h2>
          <p className="mt-3 text-sidebar-foreground/80 max-w-md">
            Choose a strong password that meets the requirements below.
          </p>
        </div>
        <div className="text-xs text-sidebar-foreground/60">v1.0 · SpinFlow ERP</div>
      </div>

      <div className="flex items-center justify-center p-6 lg:p-12 bg-background">
        <div className="w-full max-w-md space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Change Password</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {user?.email ? `Signed in as ${user.email}` : "Set a new password for your account"}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setErrorMsg("");
              if (!currentPassword) {
                setErrorMsg("Current password is required");
                return;
              }
              if (!newPassword || newPassword.length < 6) {
                setErrorMsg("New password must be at least 6 characters");
                return;
              }
              if (newPassword !== confirmPassword) {
                setErrorMsg("Passwords do not match");
                return;
              }
              if (m.isPending) return;
              m.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="space-y-1.5 mt-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${strength.color}`}
                        style={{ width: `${(strength.score / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">
                      {strength.label}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {requirements.map((req) => {
                      const ok = req.test(newPassword);
                      return (
                        <li
                          key={req.label}
                          className={`text-xs flex items-center gap-1.5 ${ok ? "text-green-600" : "text-muted-foreground"}`}
                        >
                          <span>{ok ? "✓" : "○"}</span>
                          {req.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>

            {errorMsg && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
                {errorMsg}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit || m.isPending}>
              {m.isPending ? "Updating Password…" : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

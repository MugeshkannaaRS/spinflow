import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/stores/auth";
import { useTheme } from "@/hooks/useTheme";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { User, Moon, Sun, Key, LogOut, Building2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const { theme, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);

  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };

  const handleChangePw = async () => {
    if (!pwForm.current) { toast.error("Enter current password"); return; }
    if (pwForm.next.length < 6) { toast.error("New password min 6 chars"); return; }
    if (pwForm.next !== pwForm.confirm) { toast.error("Passwords don't match"); return; }
    setPwLoading(true);
    try {
      await api.post("/auth/change-password", {
        current_password: pwForm.current,
        new_password: pwForm.next,
      });
      toast.success("Password changed successfully");
      setChangingPw(false);
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  if (!user) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );

  return (
    <div className="max-w-lg mx-auto space-y-4 p-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        Profile
      </h1>

      <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#0d9488] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
            {user.name?.charAt(0)?.toUpperCase() ?? "U"}
          </div>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-white">{user.name}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full">
              {user.role?.replace(/_/g, " ")}
            </span>
          </div>
        </div>
        {user.millName && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 text-sm text-gray-500">
            <Building2 className="w-4 h-4" />
            <span>{user.millName}</span>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            {theme === "dark" ? <Moon className="w-4 h-4 text-gray-500" /> : <Sun className="w-4 h-4 text-gray-500" />}
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {theme === "dark" ? "Dark Mode" : "Light Mode"}
            </span>
          </div>
          <button
            onClick={toggleTheme}
            className={cn("relative w-11 h-6 rounded-full transition-colors", theme === "dark" ? "bg-blue-600" : "bg-gray-200")}
          >
            <div className={cn("absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform", theme === "dark" ? "translate-x-5" : "translate-x-0.5")} />
          </button>
        </div>

        <button
          onClick={() => setChangingPw(!changingPw)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-50 dark:border-slate-700/50"
        >
          <Key className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Change Password</span>
        </button>

        {changingPw && (
          <div className="px-5 py-4 border-b border-gray-50 dark:border-slate-700/50 space-y-3 bg-gray-50/50 dark:bg-slate-700/20">
            {["current", "next", "confirm"].map((field, i) => (
              <input
                key={field}
                type="password"
                placeholder={["Current password", "New password (min 6 chars)", "Confirm new password"][i]}
                value={pwForm[field as keyof typeof pwForm]}
                onChange={e => setPwForm(p => ({ ...p, [field]: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ))}
            <button
              onClick={handleChangePw}
              disabled={pwLoading}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {pwLoading ? "Updating..." : "Update Password"}
            </button>
          </div>
        )}

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Logout</span>
        </button>
      </div>

      <div className="text-center text-xs text-gray-400 py-2">
        SpinFlow ERP · Your mill. In your hands.
      </div>
    </div>
  );
}

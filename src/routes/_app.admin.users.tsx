import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi } from "@/lib/api-service";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, UserPlus, KeyRound, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/users")({
  head: () => ({ meta: [{ title: "Users — Admin — SpinFlow ERP" }] }),
  component: AdminUsersPage,
});

const ROLE_BADGE_COLORS: Record<string, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  MILL_OWNER: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  GENERAL_MANAGER: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  PRODUCTION_MANAGER: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  QUALITY_MANAGER: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  DISPATCH_MANAGER: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  STORE_MANAGER: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  HR_MANAGER: "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400",
  ACCOUNTANT: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  MAINTENANCE_MANAGER: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400",
  SUPERVISOR: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400",
  MACHINE_OPERATOR: "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-400",
  SECURITY_GATE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  AUDITOR: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
};

const ROLES_FOR_CREATE = [
  "MILL_OWNER",
  "GENERAL_MANAGER",
  "PRODUCTION_MANAGER",
  "QUALITY_MANAGER",
  "DISPATCH_MANAGER",
  "STORE_MANAGER",
  "HR_MANAGER",
  "ACCOUNTANT",
  "MAINTENANCE_MANAGER",
  "SUPERVISOR",
  "MACHINE_OPERATOR",
  "SECURITY_GATE",
  "AUDITOR",
];

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function pwChecks(pw: string) {
  const checks = {
    min8: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(pw),
  };
  return {
    ...checks,
    passed: Object.values(checks).every(Boolean),
    score: Object.values(checks).filter(Boolean).length,
  };
}

const INITIAL_FORM = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role_code: "MILL_OWNER",
  company_id: "",
  mill_id: "",
};

function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const [companyFilter, setCompanyFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ user: any; password: string } | null>(null);
  const [resetDialog, setResetDialog] = useState<{ user: any; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const usersQ = useQuery({
    queryKey: ["admin-system-users", companyFilter],
    queryFn: () =>
      api
        .get("/admin/users", { params: { company_id: companyFilter || undefined, page_size: 500 } })
        .then((r) => r.data),
    staleTime: 30_000,
  });

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });

  const users: any[] = usersQ.data?.items ?? [];
  const companies: any[] = (companiesQ.data as any[]) ?? [];

  const filteredMills = useMemo(() => {
    if (!form.company_id) return [];
    return companies
      .filter((c: any) => c.id === form.company_id)
      .flatMap((c: any) => c.mills ?? []);
  }, [companies, form.company_id]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/admin/users", data).then((r) => r.data),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["admin-system-users"] });
      setCreateOpen(false);
      setSuccessDialog({ user: resp, password: form.password });
      setForm(INITIAL_FORM);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to create user");
    },
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, password: pwd }: { id: string; password: string }) =>
      api.patch(`/admin/users/${id}/reset-password`, { password: pwd }).then((r) => r.data),
    onSuccess: (_data, vars) => {
      const u = users.find((u: any) => u.id === vars.id);
      qc.invalidateQueries({ queryKey: ["admin-system-users"] });
      setResetDialog(null);
      setSuccessDialog({ user: u, password: vars.password });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to reset password");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-system-users"] }),
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to toggle user status");
    },
  });

  function handleResetPwd(u: any) {
    const pwd = generateTempPassword();
    setResetDialog({ user: u, password: pwd });
  }

  function confirmResetPwd(userId: string, password: string) {
    resetPwdMutation.mutate({ id: userId, password });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCreate() {
    const pw = pwChecks(form.password);
    if (!form.name || !form.email || !form.password || !form.company_id) {
      toast.error("Name, email, password, and company are required");
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (!pw.passed) {
      toast.error("Password must be at least 8 characters with uppercase, lowercase, digit, and special character");
      return;
    }
    createMutation.mutate({
      name: form.name,
      email: form.email,
      password: form.password,
      role_code: form.role_code,
      company_id: form.company_id,
      mill_id: form.mill_id || undefined,
    });
  }

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const activeUsers = users.filter((u: any) => u.is_active).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage users across all companies</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4 mr-2" />
              Create User
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Create a user under any company across the system.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="john@mill.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Min 8 chars"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer"
                    onClick={() => setShowPwd(!showPwd)}
                  >
                    {showPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="flex gap-2 text-xs mt-1">
                    {(["min8", "upper", "lower", "digit", "special"] as const).map((c) => {
                      const pass = pwChecks(form.password)[c];
                      return (
                        <span key={c} className={pass ? "text-green-600" : "text-muted-foreground"}>
                          {pass ? "✓" : "○"} {c === "min8" ? "8+" : c === "special" ? "!@#" : c}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPwd ? "text" : "password"}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground cursor-pointer"
                    onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  >
                    {showConfirmPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={form.role_code}
                  onValueChange={(v) => setForm({ ...form, role_code: v })}
                >
                  <SelectTrigger id="role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES_FOR_CREATE.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role as Role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="company_id">Company</Label>
                <Select
                  value={form.company_id}
                  onValueChange={(v) => setForm({ ...form, company_id: v, mill_id: "" })}
                >
                  <SelectTrigger id="company_id">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.filter((c: any) => c?.id).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mill_id">Mill (optional)</Label>
                <Select
                  value={form.mill_id}
                  onValueChange={(v) => setForm({ ...form, mill_id: v })}
                  disabled={!form.company_id}
                >
                  <SelectTrigger id="mill_id">
                    <SelectValue
                      placeholder={form.company_id ? "Select mill" : "Select company first"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredMills.filter((m: any) => m?.id).map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full cursor-pointer"
                onClick={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating\u2026" : "Create User"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length - activeUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>All Users</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={companyFilter} onValueChange={(v) => setCompanyFilter(v)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies.filter((c: any) => c?.id).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={[
              { key: "name", label: "Name", render: (u: any) => <span className="font-medium">{u.name}</span> },
              { key: "email", label: "Email" },
              {
                key: "role",
                label: "Role",
                render: (u: any) => (
                  <Badge className={cn("font-medium whitespace-nowrap", ROLE_BADGE_COLORS[u.role] ?? "")}>
                    {ROLE_LABELS[u.role as Role] ?? u.role}
                  </Badge>
                ),
              },
              {
                key: "company_id",
                label: "Company",
                render: (u: any) =>
                  companies.find((c: any) => c.id === u.company_id)?.name ?? "—",
              },
              {
                key: "mill_id",
                label: "Mill",
                render: (u: any) => u.mill_name ?? "—",
              },
              {
                key: "is_active",
                label: "Status",
                render: (u: any) => (
                  <Badge variant={u.is_active ? "default" : "secondary"}>
                    {u.is_active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              {
                key: "password",
                label: "Password",
                render: (u: any) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetPwd(u)}
                    disabled={!u.is_active}
                    title={u.is_active ? "Reset password" : "User is inactive"}
                  >
                    <KeyRound className="size-3.5 mr-1" />
                    Reset
                  </Button>
                ),
              },
            ] satisfies ColDef[]}
            data={users}
            rowKey={(u) => u.id}
            emptyMessage="No users found."
            actions={(u) => (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => deactivateMutation.mutate(u.id)}
                title={u.is_active ? "Deactivate" : "Reactivate"}
              >
                <Badge variant={u.is_active ? "secondary" : "default"} className="text-xs">
                  {u.is_active ? "Deactivate" : "Reactivate"}
                </Badge>
              </Button>
            )}
          />
        </CardContent>
      </Card>

      <Dialog open={!!successDialog} onOpenChange={(open) => !open && setSuccessDialog(null)}>
        <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="size-5 text-green-600" />
              User Created Successfully
            </DialogTitle>
            <DialogDescription>Share these credentials with the user.</DialogDescription>
          </DialogHeader>
          {successDialog && (
            <div className="space-y-3 mt-2">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">
                    {successDialog.user.email ?? "—"}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(successDialog.user.email)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">
                    {successDialog.password}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(successDialog.password)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {copied && <p className="text-xs text-green-600">Copied to clipboard!</p>}
              <Button className="w-full mt-2" onClick={() => setSuccessDialog(null)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resetDialog} onOpenChange={(open) => !open && setResetDialog(null)}>
        <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              This will generate a new password for {resetDialog?.user?.name}.
            </DialogDescription>
          </DialogHeader>
          {resetDialog && (
            <div className="space-y-3 mt-2">
              <div>
                <Label>New Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">
                    {resetDialog.password}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(resetDialog.password)}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setResetDialog(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => confirmResetPwd(resetDialog.user.id, resetDialog.password)}
                >
                  Confirm Reset
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

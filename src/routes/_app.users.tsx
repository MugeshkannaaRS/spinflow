import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi, mastersApi } from "@/lib/api-service";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { useAuth } from "@/stores/auth";
import { useMillSubscription } from "@/hooks/useMillConfig";
import { AccessGuard } from "@/components/AccessGuard";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { useState, useEffect, useMemo } from "react";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { toast } from "sonner";
import {
  ShieldCheck,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/users")({
  head: () => ({ meta: [{ title: "Users & Roles — SpinFlow ERP" }] }),
  component: UsersPage,
});

const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: "Full system access. Create users, manage masters, configure all modules.",
  MILL_OWNER: "View reports, stock, sales. Read-only access to other modules.",
  GENERAL_MANAGER: "Manage production, quality, dispatch, maintenance. View HR/accounts read-only.",
  PRODUCTION_MANAGER:
    "Shift entries, machine management, downtime logging. View quality/inventory.",
  QUALITY_MANAGER: "Quality tests, lot approvals, CSP tracking. View production/inventory.",
  DISPATCH_MANAGER: "Trips, loading, delivery confirmation. View inventory/stock/sales.",
  STORE_MANAGER: "Store inventory, spare parts, stock management. View purchases.",
  HR_MANAGER: "Employee records, attendance, leave, payroll.",
  ACCOUNTANT: "Invoices, payments, GST, P&L. View purchases/dispatch/sales.",
  MAINTENANCE_MANAGER: "Breakdown logs, preventive maintenance, spare tracking.",
  SUPERVISOR: "Mark attendance, shift entries, downtime logging.",
  MACHINE_OPERATOR: "Log production for assigned machine.",
  SECURITY_GATE: "Gate operations, QR scanning for dispatch.",
  AUDITOR: "Read-only access to all modules for audit purposes.",
};

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

const INITIAL_FORM = {
  full_name: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "SUPERVISOR" as string,
  department: "",
  mobile: "",
  company_id: "",
  mill_id: "",
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function UsersPage() {
  const qc = useQueryClient();
  const currentUser = useAuth((s) => s.user);
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const { data: sub } = useMillSubscription();
  const atUserLimit = !isSuperAdmin && sub ? sub.is_over_limit || sub.remaining_users === 0 : false;
  const userColConfig = useColumnConfig("hr_employees");

  const usersQ = useQuery({
    queryKey: ["system-users"],
    queryFn: usersApi.list,
    staleTime: 60_000,
    retry: 1,
  });
  const companiesQ = useQuery({
    queryKey: ["masters", "companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
    retry: 1,
  });
  const millsQ = useQuery({
    queryKey: ["masters", "mills"],
    queryFn: () => mastersApi.getMills(),
    staleTime: 60_000,
    retry: 1,
  });
  const users: any[] = usersQ.data ?? [];
  const companies: any[] = companiesQ.data ?? [];
  const activeCompanies = useMemo(
    () => companies.filter((c: any) => c?.id && c.is_active !== false),
    [companies],
  );
  const mills: any[] = millsQ.data ?? [];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ user: any; password: string } | null>(null);
  const [resetDialog, setResetDialog] = useState<{ user: any; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const filteredMills = useMemo(
    () => mills.filter((m: any) => m.company_id === form.company_id),
    [mills, form.company_id],
  );

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["system-users"] });
      setSheetOpen(false);
      setSuccessDialog({ user: resp, password: form.password });
      setForm(INITIAL_FORM);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["system-users"] });
      setSheetOpen(false);
      setEditingUser(null);
      setForm(INITIAL_FORM);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => usersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["system-users"] }),
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.resetPassword(id, data),
    onSuccess: (_data, vars) => {
      const user = users.find((u: any) => u.id === vars.id);
      qc.invalidateQueries({ queryKey: ["system-users"] });
      setResetDialog(null);
      setSuccessDialog({ user, password: vars.data.new_password });
    },
  });

  function openNewUser() {
    setEditingUser(null);
    setForm({
      ...INITIAL_FORM,
      company_id: isSuperAdmin ? "" : (currentUser?.companyId ?? ""),
    });
    setSheetOpen(true);
  }

  function openEdit(user: any) {
    setEditingUser(user);
    setForm({
      full_name: user.full_name ?? "",
      email: user.email ?? "",
      password: "",
      confirmPassword: "",
      role: user.role ?? "SUPERVISOR",
      department: user.department ?? "",
      mobile: user.mobile ?? "",
      company_id: user.company_id ?? "",
      mill_id: user.mill_id ?? "",
    });
    setSheetOpen(true);
  }

  function handleSubmit() {
    if (editingUser) {
      const data: any = {};
      if (form.full_name) data.full_name = form.full_name;
      if (form.email) data.email = form.email;
      if (form.role) data.role = form.role;
      if (form.department !== undefined) data.department = form.department;
      if (form.mobile) data.mobile = form.mobile;
      if (form.company_id) data.company_id = form.company_id;
      if (form.mill_id) data.mill_id = form.mill_id;
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        department: form.department || undefined,
        mobile: form.mobile || undefined,
        company_id: form.company_id || undefined,
        mill_id: form.mill_id || undefined,
      });
    }
  }

  function handleResetPwd(user: any) {
    const pwd = generatePassword();
    setResetDialog({ user, password: pwd });
  }

  function confirmResetPwd(userId: string, password: string) {
    resetPwdMutation.mutate({ id: userId, data: { new_password: password } });
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <AccessGuard module="users">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Users & Roles</h1>
              <p className="text-sm text-muted-foreground">
                User management, role assignment, permissions & activity tracking
              </p>
            </div>
            {atUserLimit && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="size-4 shrink-0" />
                <span>
                  User limit reached ({sub?.current_users ?? 0}/{sub?.max_users ?? 10}).{" "}
                </span>
                <Link to="/company/billing" className="font-semibold underline hover:text-red-800">
                  Upgrade plan
                </Link>
              </div>
            )}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button
                  onClick={openNewUser}
                  disabled={atUserLimit}
                  title={atUserLimit ? "User limit reached. Upgrade plan." : ""}
                >
                  <Plus className="size-4 mr-2" />
                  New User
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>{editingUser ? "Edit User" : "Create New User"}</SheetTitle>
                  <SheetDescription>
                    {editingUser
                      ? "Update user details and role."
                      : "Fill in the details to create a new user."}
                  </SheetDescription>
                </SheetHeader>
                <div className="space-y-4 mt-6">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Full Name</Label>
                    <Input
                      id="full_name"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
                  {!editingUser && (
                    <>
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
                            {showConfirmPwd ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger id="role">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((role) => {
                          // MILL_OWNER can only create roles below them in hierarchy
                          if (currentUser?.role === "SUPER_ADMIN") return true;
                          return !["SUPER_ADMIN", "MILL_OWNER"].includes(role);
                        }).map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {editingUser && ROLE_DESCRIPTIONS[form.role] && (
                    <Card className="bg-muted/50">
                      <CardContent className="pt-4 text-sm text-muted-foreground">
                        <ShieldCheck className="size-4 inline mr-1.5 text-primary" />
                        {ROLE_DESCRIPTIONS[form.role]}
                      </CardContent>
                    </Card>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="company_id">Company</Label>
                    <Select
                      value={form.company_id}
                      onValueChange={(v) => setForm({ ...form, company_id: v, mill_id: "" })}
                      disabled={!isSuperAdmin && !!currentUser?.companyId}
                    >
                      <SelectTrigger id="company_id">
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeCompanies
                          .filter((c: any) => c?.id)
                          .map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mill_id">
                      Mill{" "}
                      {form.role !== "MILL_OWNER" ? (
                        <span className="text-destructive">*</span>
                      ) : (
                        "(optional)"
                      )}
                    </Label>
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
                        {filteredMills
                          .filter((m: any) => m?.id)
                          .map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department (optional)</Label>
                    <Input
                      id="department"
                      value={form.department ?? ""}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                      placeholder="e.g. Spinning"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mobile">Mobile (optional)</Label>
                    <Input
                      id="mobile"
                      value={form.mobile ?? ""}
                      onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                      placeholder="+91 9876543210"
                    />
                  </div>
                  <Button
                    className="w-full cursor-pointer"
                    onClick={handleSubmit}
                    disabled={
                      createMutation.isPending ||
                      updateMutation.isPending ||
                      !!(!editingUser && form.password !== form.confirmPassword)
                    }
                  >
                    {editingUser ? "Update User" : "Create User"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
          <Card>
            <CardContent className="pt-6">
              <ErrorBoundary inline label="Users">
                <DataTable
                  tableId="users_list"
                  columns={
                    [
                      {
                        key: "full_name",
                        label: "Name",
                        render: (u: any) => <span className="font-medium">{u.full_name}</span>,
                      },
                      { key: "email", label: "Email" },
                      {
                        key: "role",
                        label: "Role",
                        type: "status",
                        render: (u: any) => (
                          <Badge className={cn("font-medium", ROLE_BADGE_COLORS[u.role] ?? "")}>
                            {ROLE_LABELS[u.role as Role] ?? u.role}
                          </Badge>
                        ),
                      },
                      { key: "department", label: "Department" },
                      {
                        key: "last_login",
                        label: "Last Login",
                        render: (u: any) =>
                          u.last_login ? (
                            <span className="text-xs text-muted-foreground">
                              {new Date(u.last_login).toLocaleDateString()}
                            </span>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "is_active",
                        label: "Status",
                        type: "status",
                        render: (u: any) => (
                          <Badge variant={u.is_active ? "default" : "secondary"}>
                            {u.is_active ? "Active" : "Inactive"}
                          </Badge>
                        ),
                      },
                    ] satisfies ColDef[]
                  }
                  data={users}
                  rowKey={(u) => u.id}
                  exportFilename="users"
                  emptyMessage="No users found. Create your first user."
                  actions={(user) => (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(user)}
                        title="Edit"
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deactivateMutation.mutate(user.id)}
                        title={user.is_active ? "Deactivate" : "Reactivate"}
                      >
                        {user.is_active ? (
                          <ToggleRight className="size-4 text-destructive" />
                        ) : (
                          <ToggleLeft className="size-4 text-green-600" />
                        )}
                      </Button>
                      {user.is_active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleResetPwd(user)}
                          title="Reset Password"
                        >
                          <KeyRound className="size-4" />
                        </Button>
                      )}
                    </div>
                  )}
                />
              </ErrorBoundary>
            </CardContent>
          </Card>
        </div>

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
                      {successDialog.user?.email ?? "—"}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        successDialog.user?.email && copyToClipboard(successDialog.user.email)
                      }
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
                This will generate a new password for {resetDialog?.user?.full_name}.
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
      </AccessGuard>
    </>
  );
}

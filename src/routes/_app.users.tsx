import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "@/lib/api-service";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Users,
  Activity,
  UserCheck,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  ACCOUNTANT: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
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
};

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let pwd = "";
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function UsersPage() {
  const qc = useQueryClient();
  const usersQ = useQuery({
    queryKey: ["system-users"],
    queryFn: usersApi.list,
    staleTime: 60_000,
    retry: 1,
  });
  const users: any[] = usersQ.data ?? [];

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ user: any; password: string } | null>(null);
  const [resetDialog, setResetDialog] = useState<{ user: any; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const activeUsers = users.filter((u: any) => u.is_active).length;
  const roleCount = new Set(users.map((u: any) => u.role)).size;

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
    setForm(INITIAL_FORM);
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
      updateMutation.mutate({ id: editingUser.id, data });
    } else {
      createMutation.mutate({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role: form.role,
        department: form.department || undefined,
        mobile: form.mobile || undefined,
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
      <Topbar
        title="Users & Roles"
        subtitle="User management, role assignment, permissions & activity tracking"
      >
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button onClick={openNewUser}>
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
                    {ROLES.map((role) => (
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
      </Topbar>
      <AccessGuard module="users">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeUsers}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{roleCount}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Inactive
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{users.length - activeUsers}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[640px] w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No users found. Create your first user.
                        </TableCell>
                      </TableRow>
                    )}
                    {users.map((user: any) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", ROLE_BADGE_COLORS[user.role] ?? "")}>
                            {ROLE_LABELS[user.role as Role] ?? user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>{user.department ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "secondary"}>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                      {successDialog.user.email ?? successDialog.user.email}
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

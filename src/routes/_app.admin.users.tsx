import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi, adminApi } from "@/lib/api-service";
import { ROLE_LABELS } from "@/lib/rbac";
import type { Role } from "@/lib/rbac";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Eye, EyeOff, UserPlus, KeyRound, Copy, Check,
  Building2, Factory, ChevronRight, Search, X,
  Users, Shield, CheckCircle2, XCircle, Filter, AlertTriangle,
} from "lucide-react";
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
  "MILL_OWNER", "GENERAL_MANAGER", "PRODUCTION_MANAGER", "QUALITY_MANAGER",
  "DISPATCH_MANAGER", "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
  "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR",
];

const DEPARTMENTS = [
  "Production", "Quality", "Dispatch", "Stores", "HR",
  "Accounts", "Maintenance", "Purchase", "Sales", "Administration",
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
  return { ...checks, passed: Object.values(checks).every(Boolean) };
}

const INITIAL_FORM = {
  name: "", email: "", password: "", confirmPassword: "",
  role_code: "MILL_OWNER", company_id: "", mill_id: "",
};

function AdminUsersPage() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [selectedMillId, setSelectedMillId] = useState<string | null>(null);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [deptFilter, setDeptFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [successDialog, setSuccessDialog] = useState<{ user: any; password: string } | null>(null);
  const [resetDialog, setResetDialog] = useState<{ user: any; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });
  const companies: any[] = (companiesQ.data as any[]) ?? [];
  const activeCompanies = useMemo(
    () => companies.filter((c: any) => c?.id && c.is_active !== false),
    [companies]
  );

  const selectedCompany = useMemo(
    () => companies.find((c: any) => c.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );

  const millsQ = useQuery({
    queryKey: ["masters", "mills", selectedCompanyId],
    queryFn: () => api.get("/masters/mills", { params: { company_id: selectedCompanyId, page_size: 500 } }).then(r => r.data?.data ?? []),
    enabled: !!selectedCompanyId && !globalSearch,
  });
  const millsData: any[] = millsQ.data ?? [];
  const selectedMill = useMemo(
    () => millsData.find((m: any) => m.id === selectedMillId),
    [millsData, selectedMillId]
  );

  const usersQ = useQuery({
    queryKey: ["admin-system-users", selectedCompanyId, globalSearch],
    queryFn: () =>
      api.get("/admin/users", {
        params: globalSearch ? { page_size: 500 } : { company_id: selectedCompanyId || undefined, page_size: 500 },
      }).then((r) => r.data),
    staleTime: 30_000,
  });
  const allUsers: any[] = usersQ.data?.items ?? [];

  const users = useMemo(() => {
    let filtered = allUsers;
    if (selectedMillId) {
      filtered = filtered.filter((u: any) => u.mill_id === selectedMillId);
    }
    if (deptFilter) {
      filtered = filtered.filter((u: any) => u.department === deptFilter);
    }
    if (roleFilter) {
      filtered = filtered.filter((u: any) => u.role === roleFilter);
    }
    if (statusFilter) {
      filtered = filtered.filter((u: any) =>
        statusFilter === "active" ? u.is_active : !u.is_active
      );
    }
    return filtered;
  }, [allUsers, selectedMillId, deptFilter, roleFilter, statusFilter]);

  const millUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of allUsers) {
      const mid = u.mill_id ?? "";
      counts[mid] = (counts[mid] ?? 0) + 1;
    }
    return counts;
  }, [allUsers]);

  const companyStats = useMemo(() => {
    const companyUsers: Record<string, number> = {};
    const companyActive: Record<string, number> = {};
    for (const u of allUsers) {
      const cid = u.company_id ?? "";
      companyUsers[cid] = (companyUsers[cid] ?? 0) + 1;
      if (u.is_active) companyActive[cid] = (companyActive[cid] ?? 0) + 1;
    }
    const millCounts: Record<string, number> = {};
    for (const m of millsData) {
      const cid = m.company_id ?? "";
      millCounts[cid] = (millCounts[cid] ?? 0) + 1;
    }
    return { companyUsers, companyActive, millCounts };
  }, [allUsers, millsData]);

  const formMillsQ = useQuery({
    queryKey: ["masters", "mills", "form", form.company_id],
    queryFn: () => mastersApi.getMills(form.company_id),
    enabled: !!form.company_id,
    staleTime: 30_000,
  });
  const formMills: any[] = formMillsQ.data ?? [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post("/admin/users", data).then((r) => r.data),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["admin-system-users"] });
      setCreateOpen(false);
      setSuccessDialog({ user: resp, password: form.password });
      setForm(INITIAL_FORM);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to create user"),
  });

  const resetPwdMutation = useMutation({
    mutationFn: ({ id, password: pwd }: { id: string; password: string }) =>
      api.patch(`/admin/users/${id}/reset-password`, { password: pwd }).then((r) => r.data),
    onSuccess: (_data, vars) => {
      const u = allUsers.find((u: any) => u.id === vars.id);
      qc.invalidateQueries({ queryKey: ["admin-system-users"] });
      setResetDialog(null);
      setSuccessDialog({ user: u, password: vars.password });
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to reset password"),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}/deactivate`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-system-users"] }),
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Failed to toggle user status"),
  });

  function handleResetPwd(u: any) {
    setResetDialog({ user: u, password: generateTempPassword() });
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
      toast.error("Password must be 8+ chars with uppercase, lowercase, digit, and special");
      return;
    }
    const c = companies.find((c: any) => c.id === form.company_id);
    if (c) {
      const current = companyStats.companyUsers[c.id] ?? 0;
      const max = c.max_users ?? 50;
      if (current >= max) {
        toast.error(`User limit reached for ${c.name}. Current: ${current}/${max}. Upgrade plan or increase limit first.`);
        return;
      }
    }
    createMutation.mutate({
      name: form.name, email: form.email, password: form.password,
      role_code: form.role_code, company_id: form.company_id,
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

  const allRoles = [...new Set(allUsers.map((u: any) => u.role))].sort();
  const activeUsers = allUsers.filter((u: any) => u.is_active).length;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
            {selectedCompany ? (
              <>
                <button onClick={() => { setSelectedCompanyId(null); setSelectedMillId(null); }}
                  className="text-blue-600 hover:underline cursor-pointer">
                  {selectedCompany.name}
                </button>
                {selectedMill && (
                  <>
                    <ChevronRight className="size-3" />
                    <span className="font-medium">{selectedMill.name}</span>
                  </>
                )}
              </>
            ) : (
              <span>Select a company to manage users</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={globalSearch ? "default" : "outline"}
            size="sm"
            onClick={() => { setGlobalSearch(!globalSearch); setSelectedCompanyId(null); setSelectedMillId(null); }}
          >
            <Search className="size-3.5 mr-1" />
            Global Search
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="size-3.5 mr-1" />
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
                  <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@mill.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPwd ? "text" : "password"} value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 chars" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                      onClick={() => setShowPwd(!showPwd)}>
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
                    <Input id="confirmPassword" type={showConfirmPwd ? "text" : "password"} value={form.confirmPassword}
                      onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} placeholder="Re-enter password" />
                    <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                      onClick={() => setShowConfirmPwd(!showConfirmPwd)}>
                      {showConfirmPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={form.role_code} onValueChange={(v) => setForm({ ...form, role_code: v })}>
                    <SelectTrigger id="role"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {ROLES_FOR_CREATE.map((role) => (
                        <SelectItem key={role} value={role}>{ROLE_LABELS[role as Role]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_id">Company</Label>
                  <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, mill_id: "" })}>
                    <SelectTrigger id="company_id"><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {activeCompanies.filter((c: any) => c?.id).map((c: any) => {
                        const cid = c.id;
                        const current = companyStats.companyUsers[cid] ?? 0;
                        const max = c.max_users ?? 50;
                        const pct = max > 0 ? (current / max) * 100 : 0;
                        const overLimit = current >= max;
                        return (
                          <SelectItem key={c.id} value={c.id}>
                            <div className="flex items-center justify-between w-full gap-4">
                              <span>{c.name}</span>
                              <span className={cn(
                                "text-xs whitespace-nowrap",
                                pct >= 100 ? "text-red-500 font-semibold" : pct >= 90 ? "text-amber-500" : "text-muted-foreground"
                              )}>
                                {current}/{max}
                                {pct >= 100 ? " ⛔" : pct >= 90 ? " ⚠" : ""}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {form.company_id && (() => {
                    const c = companies.find((c: any) => c.id === form.company_id);
                    if (!c) return null;
                    const current = companyStats.companyUsers[c.id] ?? 0;
                    const max = c.max_users ?? 50;
                    const pct = max > 0 ? (current / max) * 100 : 0;
                    const overLimit = current >= max;
                    return (
                      <div className={cn(
                        "mt-1 p-2 rounded text-xs border",
                        pct >= 100
                          ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800"
                          : pct >= 90
                          ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800"
                          : "bg-muted/30 border-transparent text-muted-foreground"
                      )}>
                        <div className="flex items-center justify-between">
                          <span>User Limit</span>
                          <span className="font-semibold">{current} / {max}</span>
                        </div>
                        {pct >= 100 && (
                          <p className="text-[10px] mt-1">⛔ User limit reached. Upgrade plan or increase limit before creating more users.</p>
                        )}
                        {pct >= 90 && pct < 100 && (
                          <p className="text-[10px] mt-1">⚠ Approaching user limit ({Math.round(pct)}% used).</p>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mill_id">Mill (optional)</Label>
                  <Select value={form.mill_id} onValueChange={(v) => setForm({ ...form, mill_id: v })} disabled={!form.company_id}>
                    <SelectTrigger id="mill_id">
                      <SelectValue placeholder={form.company_id ? "Select mill" : "Select company first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {formMills.filter((m: any) => m?.id).map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full cursor-pointer" onClick={handleCreate} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating\u2026" : "Create User"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Error banners */}
      {usersQ.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-700 dark:text-red-400">Failed to load users. You may be viewing stale data.</p>
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => usersQ.refetch()}>Retry</Button>
        </div>
      )}

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-12 gap-4 min-h-[500px]">
        {/* LEFT PANEL: Companies */}
        <div className="col-span-3 border rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
          <div className="p-3 bg-muted/30 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="size-4" /> Companies
            </h3>
          </div>
          <ScrollArea className="h-[500px]">
            {activeCompanies.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No active companies found.</div>
            ) : (
              <div className="divide-y">
                {activeCompanies.map((c: any) => {
                  const isSelected = selectedCompanyId === c.id;
                  const uCount = companyStats.companyUsers[c.id] ?? 0;
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCompanyId(c.id); setSelectedMillId(null); setGlobalSearch(false); }}
                      className={cn(
                        "w-full text-left p-3 transition-colors cursor-pointer hover:bg-muted/50",
                        isSelected && "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                      )}
                    >
                      <div className="font-medium text-sm truncate">{c.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-3">
                        <span>{uCount} users</span>
                        <span>{companyStats.millCounts[c.id] ?? 0} mills</span>
                      </div>
                      {isSelected && selectedCompany && (
                        <div className="mt-2 pt-2 border-t text-xs space-y-1 text-muted-foreground">
                          <span className="flex justify-between">
                            <span>Active users</span>
                            <span className="font-semibold text-green-600">{companyStats.companyActive[c.id] ?? 0}</span>
                          </span>
                          <span className="flex justify-between">
                            <span>Plan</span>
                            <span className="font-semibold capitalize">{c.plan ?? c.subscription_plan ?? "starter"}</span>
                          </span>
                          <span className="flex justify-between">
                            <span>User Limit</span>
                            <span className={cn(
                              "font-semibold",
                              (() => { const pct = (c.max_users ?? 50) > 0 ? ((uCount) / (c.max_users ?? 50)) * 100 : 0; return pct >= 100 ? "text-red-500" : pct >= 90 ? "text-amber-500" : "text-muted-foreground"; })()
                            )}>
                              {uCount} / {c.max_users ?? 50}
                            </span>
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* MIDDLE PANEL: Mills */}
        <div className="col-span-3 border rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
          <div className="p-3 bg-muted/30 border-b">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Factory className="size-4" /> Mills
              {selectedCompany && <span className="text-xs font-normal text-muted-foreground">— {selectedCompany.name}</span>}
            </h3>
          </div>
          <ScrollArea className="h-[500px]">
            {!selectedCompanyId ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                <Building2 className="size-8 mx-auto mb-2 opacity-40" />
                Select a company
              </div>
            ) : globalSearch ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Global search mode — all mills
              </div>
            ) : millsData.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No mills found.</div>
            ) : (
              <div className="divide-y">
                {millsData.map((m: any) => {
                  const isSelected = selectedMillId === m.id;
                  const uCount = millUserCounts[m.id] ?? 0;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelectedMillId(m.id)}
                      className={cn(
                        "w-full text-left p-3 transition-colors cursor-pointer hover:bg-muted/50",
                        isSelected && "bg-emerald-50 dark:bg-emerald-900/20 border-l-2 border-emerald-500"
                      )}
                    >
                      <div className="font-medium text-sm truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">{uCount} users</div>
                      {isSelected && (
                        <div className="mt-2 pt-2 border-t text-xs space-y-1 text-muted-foreground">
                          <span className="flex justify-between">
                            <span>Code</span>
                            <span className="font-mono">{m.code}</span>
                          </span>
                          <span className="flex justify-between">
                            <span>Status</span>
                            <span className={m.is_active ? "text-green-600" : "text-red-500"}>{m.is_active ? "Active" : "Inactive"}</span>
                          </span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* RIGHT PANEL: Users */}
        <div className="col-span-6 border rounded-lg bg-white dark:bg-slate-900 dark:border-slate-700 overflow-hidden">
          <div className="p-3 bg-muted/30 border-b">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Users className="size-4" /> Users
                {selectedMill && <span className="text-xs font-normal text-muted-foreground">— {selectedMill.name}</span>}
                {globalSearch && <span className="text-xs font-normal text-muted-foreground">— All Companies</span>}
              </h3>
              <span className="text-xs text-muted-foreground">{users.length} of {allUsers.length}</span>
            </div>
            {/* Filters */}
            <div className="flex items-center gap-2 mt-2 pt-2 border-t">
              <Filter className="size-3 text-muted-foreground" />
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-slate-800">
                <option value="">All Departments</option>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-slate-800">
                <option value="">All Roles</option>
                {allRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r as Role] ?? r}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="px-2 py-1 text-xs border rounded-md bg-white dark:bg-slate-800">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {(deptFilter || roleFilter || statusFilter) && (
                <button onClick={() => { setDeptFilter(""); setRoleFilter(""); setStatusFilter(""); }}
                  className="text-xs text-blue-600 hover:underline cursor-pointer ml-auto">
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <ScrollArea className="h-[500px]">
            {!selectedCompanyId && !globalSearch ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <Users className="size-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Select a company and mill</p>
                <p className="text-xs mt-1">Use the left panels to navigate the hierarchy</p>
              </div>
            ) : users.length === 0 ? (
              <div className="p-12 text-center text-sm text-muted-foreground">
                <Users className="size-12 mx-auto mb-3 opacity-30" />
                <p>No users found</p>
                <p className="text-xs mt-1">Create a user or adjust filters</p>
              </div>
            ) : (
              <div className="divide-y">
                {users.map((u: any) => (
                  <div key={u.id} className="p-3 flex items-center gap-3 hover:bg-muted/30">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                      u.is_active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-400"
                    )}>
                      {u.name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{u.name}</span>
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-medium",
                          ROLE_BADGE_COLORS[u.role] ?? "bg-gray-100 text-gray-600"
                        )}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                        {u.is_active
                          ? <CheckCircle2 className="size-3 text-green-500 shrink-0" />
                          : <XCircle className="size-3 text-red-400 shrink-0" />
                        }
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.email}</div>
                    </div>
                    <div className="text-xs text-muted-foreground hidden md:block">
                      {u.mill_name ?? "—"}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => handleResetPwd(u)} disabled={!u.is_active}>
                        <KeyRound className="size-3 mr-1" /> Reset
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => deactivateMutation.mutate(u.id)}>
                        {u.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Success Dialog */}
      <Dialog open={!!successDialog} onOpenChange={(open) => !open && setSuccessDialog(null)}>
        <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <Check className="size-5" /> User Created / Password Reset
            </DialogTitle>
            <DialogDescription>Share these credentials with the user.</DialogDescription>
          </DialogHeader>
          {successDialog && (
            <div className="space-y-3 mt-2">
              <div>
                <Label>Email</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">{successDialog.user?.email ?? "—"}</code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(successDialog.user?.email ?? "")}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">{successDialog.password}</code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(successDialog.password)}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              {copied && <p className="text-xs text-green-600">Copied to clipboard!</p>}
              <Button className="w-full mt-2" onClick={() => setSuccessDialog(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetDialog} onOpenChange={(open) => !open && setResetDialog(null)}>
        <DialogContent className="w-full max-w-lg mx-4">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>New password for {resetDialog?.user?.name}</DialogDescription>
          </DialogHeader>
          {resetDialog && (
            <div className="space-y-3 mt-2">
              <div>
                <Label>New Password</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 px-3 py-2 rounded bg-muted text-sm">{resetDialog.password}</code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(resetDialog.password)}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" className="flex-1" onClick={() => setResetDialog(null)}>Cancel</Button>
                <Button className="flex-1" onClick={() => confirmResetPwd(resetDialog.user.id, resetDialog.password)}>
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

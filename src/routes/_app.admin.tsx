import { createFileRoute, useSearch, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi, usersApi, auditApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { z } from "zod";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Blocks,
  Ban,
  Pencil,
  Download,
  CheckCircle,
  Check,
  ChevronRight,
  CheckCircle2,
  Copy,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import * as XLSX from "xlsx";
import { fmtDate } from "@/lib/format";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";

const AdminSearchSchema = z.object({
  tab: z.string().optional(),
  action: z.string().optional(),
  company: z.string().optional(),
}).optional().default({});

export const Route = createFileRoute("/_app/admin")({
  validateSearch: (search) => AdminSearchSchema.parse(search),
  head: () => ({ meta: [{ title: "Admin — SpinFlow ERP" }] }),
  component: AdminPage,
});

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  production: "Production",
  quality: "Quality",
  stock: "Stock",
  inventory: "Inventory",
  lotrac: "LoTrac",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  payroll: "Payroll",
  accounts: "Accounts",
  maintenance: "Maintenance",
  reports: "Reports",
  audit: "Audit",
  users: "Users",
  masters: "Masters",
};
const ALL_MODULES = Object.keys(MODULE_LABELS);

function AdminPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const searchParams = useSearch({ from: "/_app/admin" });
  const [tab, setTab] = useState(searchParams?.tab ?? "companies");
  const [localSearch, setLocalSearch] = useState("");

  const [addCompanyOpen, setAddCompanyOpen] = useState(searchParams?.action === "add" ? true : false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [modulesCompany, setModulesCompany] = useState<Company | null>(null);
  const [suspendCompany, setSuspendCompany] = useState<Company | null>(null);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState(searchParams?.company ?? "");
  const [resetPwUser, setResetPwUser] = useState<{ id: string; name: string } | null>(null);
  const [newPw, setNewPw] = useState("");
  const [showPw, setShowPw] = useState(false);

  const handleSuspend = async (company: Company) => {
    try {
      const res = await adminApi.suspendCompany(company.id);
      const status = res.is_active ? "activated" : "suspended";
      toast.success(`${company.name} has been ${status}`);
      setSuspendCompany(null);
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
    } catch {
      toast.error("Failed to update company status");
    }
  };

  const handleExport = () => {
    const rows = companiesData.map((c) => ({
      Code: c.code,
      "Company Name": c.name,
      GSTIN: c.gstin || "—",
      Phone: c.phone || "—",
      Email: c.email || "—",
      "Max Users": c.max_users || 50,
      "Active Users": companyUserCounts[c.id] ?? 0,
      Mills: companyMillCounts[c.id] ?? 0,
      Plan: (c as any).subscription_plan || (c as any).plan || "Pro",
      Status: c.is_active ? "Active" : "Suspended",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Companies");
    XLSX.writeFile(wb, `SpinFlow_Companies_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const companiesQ = useQuery({
    queryKey: ["masters", "companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
    retry: 1,
  });
  const usersQ = useQuery({
    queryKey: ["system-users"],
    queryFn: () => usersApi.list(),
    staleTime: 60_000,
    retry: 1,
  });
  const millsQ = useQuery({
    queryKey: ["masters", "mills"],
    queryFn: () => mastersApi.getMills(),
    staleTime: 60_000,
    retry: 1,
  });

  const auditQ = useQuery({
    queryKey: ["admin", "audit-logs"],
    queryFn: () => auditApi.getLogs(),
    staleTime: 30_000,
    retry: 1,
    enabled: tab === "audit",
  });

  const adminUsersQ = useQuery({
    queryKey: ["admin-users", filterCompanyId],
    queryFn: () => api.get("/admin/users", { params: { company_id: filterCompanyId || undefined } }).then(r => r.data),
    staleTime: 30_000,
    retry: 1,
    enabled: tab === "users",
  });

  const companiesData = (companiesQ.data ?? []) as Company[];
  const usersData = (usersQ.data ?? []) as any[];
  const millsData = (millsQ.data ?? []) as any[];
  const auditData = (auditQ.data ?? []) as any[];

  const companyUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of usersData) {
      const id = u.company_id ?? "";
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [usersData]);

  const companyMillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of millsData) {
      const id = m.company_id ?? "";
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  }, [millsData]);

  const totalActiveUsers = usersData.filter((u: any) => u.is_active).length;
  const totalMills = millsData.length;

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <>
        <div className="p-6 text-destructive text-lg font-medium">
          Only Super Admin can access this page.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="modules">Module Manager</TabsTrigger>
              <TabsTrigger value="limits">User Limits</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="audit">Audit</TabsTrigger>
            </TabsList>

            <TabsContent value="companies">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Companies ({companiesData.length})</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setAddCompanyOpen(true)}>
                      <Plus className="size-4 mr-1" /> Add Company
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="admin_companies"
                    columns={[
                      { key: "name", label: "Company Name", render: (c: any) => <span className="font-medium">{c.name}</span> },
                      { key: "code", label: "Code" },
                      { key: "gstin", label: "GSTIN" },
                      { key: "max_users", label: "Max Users", render: (c: any) => c.max_users ?? 50 },
                      { key: "_active_users", label: "Active Users", render: (c: any) => companyUserCounts[c.id] ?? 0 },
                      { key: "_mills", label: "Mills", render: (c: any) => companyMillCounts[c.id] ?? 0 },
                      {
                        key: "plan",
                        label: "Plan",
                        render: (c: any) => {
                          const PLAN_COLORS: Record<string, string> = {
                            starter: "bg-gray-100 text-gray-600",
                            growth: "bg-blue-100 text-blue-700",
                            business: "bg-indigo-100 text-indigo-700",
                            enterprise: "bg-purple-100 text-purple-700",
                            unlimited: "bg-amber-100 text-amber-700",
                          };
                          const plan = c.plan ?? c.subscription_plan ?? "starter";
                          const color = PLAN_COLORS[plan] ?? PLAN_COLORS.starter;
                          return (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${color}`}>
                              {plan}
                            </span>
                          );
                        },
                      },
                      {
                        key: "is_active",
                        label: "Status",
                        render: (c: any) => (
                          <span className={c.is_active
                            ? "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }>
                            {c.is_active ? "Active" : "Suspended"}
                          </span>
                        ),
                      },
                    ] satisfies ColDef[]}
                    data={companiesData}
                    rowKey={(c: any) => c.id}
                    exportFilename="admin_companies"
                    actions={(item: any) => (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditCompany(item)}>
                          <Pencil className="size-3.5 mr-1" /> Edit
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setModulesCompany(item)}>
                          <Blocks className="size-3.5 mr-1" /> Modules
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={item.is_active
                            ? "text-red-600 hover:bg-red-50 border-red-200"
                            : "text-green-600 hover:bg-green-50 border-green-200"
                          }
                          onClick={() => setSuspendCompany(item)}
                        >
                          {item.is_active ? (
                            <><Ban className="size-3.5 mr-1" /> Suspend</>
                          ) : (
                            <><CheckCircle className="size-3.5 mr-1" /> Activate</>
                          )}
                        </Button>
                      </div>
                    )}
                  />
                </CardContent>
                <EditCompanyDialog company={editCompany} onClose={() => setEditCompany(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["masters"] }); qc.invalidateQueries({ queryKey: ["admin-summary"] }); setEditCompany(null); }} />
                <ModulesDialog company={modulesCompany} onClose={() => setModulesCompany(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["masters"] }); qc.invalidateQueries({ queryKey: ["admin-summary"] }); if (modulesCompany?.id) qc.invalidateQueries({ queryKey: ["company-modules", modulesCompany.id] }); setModulesCompany(null); }} />
                <AlertDialog open={!!suspendCompany} onOpenChange={() => setSuspendCompany(null)}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {suspendCompany?.is_active ? "Suspend" : "Activate"} {suspendCompany?.name}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {suspendCompany?.is_active
                          ? "All users of this company will be unable to login until reactivated."
                          : "This will restore access for all users of this company."
                        }
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className={suspendCompany?.is_active ? "bg-red-600 hover:bg-red-700" : ""}
                        onClick={() => suspendCompany && handleSuspend(suspendCompany)}
                      >
                        {suspendCompany?.is_active ? "Yes, Suspend" : "Yes, Activate"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AddCompanyDialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen} />
              </Card>
            </TabsContent>

            <TabsContent value="modules">
              <ModuleManagerTab />
            </TabsContent>

            <TabsContent value="limits">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">User Limits Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 grid-cols-3 mb-6">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Companies</CardTitle>
                      </CardHeader>
                      <CardContent><div className="text-2xl font-bold">{companiesData.length}</div></CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Active Users</CardTitle>
                      </CardHeader>
                      <CardContent><div className="text-2xl font-bold">{totalActiveUsers}</div></CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Mills</CardTitle>
                      </CardHeader>
                      <CardContent><div className="text-2xl font-bold">{totalMills}</div></CardContent>
                    </Card>
                  </div>
                  <DataTable
                    tableId="admin_user_limits"
                    columns={[
                      { key: "name", label: "Company", render: (c: any) => <span className="font-medium">{c.name}</span> },
                      { key: "_current", label: "Current Users", render: (c: any) => companyUserCounts[c.id] ?? 0 },
                      { key: "max_users", label: "Max Users", render: (c: any) => c.max_users ?? 50 },
                      {
                        key: "_usage",
                        label: "Usage",
                        render: (c: any) => {
                          const current = companyUserCounts[c.id] ?? 0;
                          const max = c.max_users ?? 50;
                          const pct = Math.round((current / max) * 100);
                          const color = pct < 70 ? "bg-green-500" : pct < 90 ? "bg-yellow-500" : "bg-red-500";
                          return (
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className={cn("h-2 w-24", color)} />
                              <span className="text-xs text-muted-foreground">{pct}%</span>
                            </div>
                          );
                        },
                      },
                    ] satisfies ColDef[]}
                    data={companiesData}
                    rowKey={(c: any) => c.id}
                    exportFilename="user_limits"
                    actions={(item: any) => (
                      <EditLimitDialog company={item} />
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="users">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">All Users</CardTitle>
                  <Button size="sm" onClick={() => setShowCreateUser(true)}>
                    <UserPlus className="w-4 h-4 mr-2" /> Add User
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex items-center gap-3">
                    <select
                      value={filterCompanyId}
                      onChange={e => setFilterCompanyId(e.target.value)}
                      className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800"
                    >
                      <option value="">All Companies</option>
                      {companiesData.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <span className="text-xs text-muted-foreground">
                      {adminUsersQ.data?.items?.length ?? 0} users
                    </span>
                  </div>
                  <DataTable
                    tableId="admin_users"
                    columns={[
                      { key: "name", label: "Name", render: (u: any) => <span className="font-medium">{u.name}</span> },
                      { key: "email", label: "Email" },
                      { key: "role", label: "Role", render: (u: any) => <span className="text-xs uppercase">{u.role}</span> },
                      { key: "company_id", label: "Company", render: (u: any) => companiesData.find((c: any) => c.id === u.company_id)?.name ?? u.company_id },
                      { key: "mill_name", label: "Mill", render: (u: any) => u.mill_name ?? "—" },
                      {
                        key: "is_active",
                        label: "Status",
                        render: (u: any) => (
                          <span className={u.is_active ? "text-green-600 text-xs font-medium" : "text-red-600 text-xs font-medium"}>
                            {u.is_active ? "Active" : "Inactive"}
                          </span>
                        ),
                      },
                      {
                        key: "must_change_password",
                        label: "Password",
                        render: (u: any) => u.must_change_password ? <span className="text-xs text-amber-600">Change required</span> : <span className="text-xs text-gray-400">—</span>,
                      },
                    ] satisfies ColDef[]}
                    data={adminUsersQ.data?.items ?? []}
                    rowKey={(u: any) => u.id}
                    loading={adminUsersQ.isLoading}
                    actions={(item: any) => (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => { setResetPwUser({ id: item.id, name: item.name }); setNewPw(""); }}>
                          Reset Password
                        </Button>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Create User Dialog */}
              <CreateUserDialog
                open={showCreateUser}
                onOpenChange={setShowCreateUser}
                companies={companiesData}
                onDone={() => { qc.invalidateQueries({ queryKey: ["admin-users"] }); qc.invalidateQueries({ queryKey: ["system-users"] }); qc.invalidateQueries({ queryKey: ["admin-summary"] }); }}
              />

              {/* Reset Password Dialog */}
              <Dialog open={!!resetPwUser} onOpenChange={() => setResetPwUser(null)}>
                <DialogContent className="max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                    <DialogDescription>Set a new password for {resetPwUser?.name}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="relative">
                      <Input
                        type={showPw ? "text" : "password"}
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder="New password (min 6 chars)"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setResetPwUser(null)}>Cancel</Button>
                    <Button onClick={async () => {
                      if (!newPw || newPw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
                      try {
                        await api.patch(`/admin/users/${resetPwUser!.id}/reset-password`, { password: newPw });
                        toast.success(`Password reset for ${resetPwUser!.name}`);
                        setResetPwUser(null);
                        qc.invalidateQueries({ queryKey: ["admin-users"] });
                      } catch { toast.error("Failed to reset password"); }
                    }} disabled={!newPw || newPw.length < 6}>
                      Reset Password
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="audit">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Audit Logs (All Companies)</CardTitle>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="admin_audit"
                    columns={[
                      { key: "company_id", label: "Company", render: (r: any) => companiesData.find((c: any) => c.id === r.company_id)?.name ?? r.company_id },
                      { key: "user_id", label: "User" },
                      { key: "action", label: "Action" },
                      { key: "module", label: "Module" },
                      { key: "details", label: "Details" },
                      { key: "created_at", label: "Date", type: "date", render: (r: any) => r.created_at ? new Date(r.created_at).toLocaleString() : "—" },
                    ] satisfies ColDef[]}
                    data={auditData}
                    rowKey={(r: any) => r.id}
                    loading={auditQ.isLoading}
                    exportFilename="audit_logs"
                    emptyMessage="No audit logs found."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
    </>
  );
}

function EditLimitDialog({ company }: { company: Company }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newLimit, setNewLimit] = useState(company.max_users ?? 50);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="w-3 h-3 mr-1" /> Edit Limit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit User Limit</DialogTitle>
          <DialogDescription>
            Set maximum users for {company.name}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>Current limit:</span>
            <span className="font-semibold text-gray-900">{company.max_users ?? 50} users</span>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">
              New Limit
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={newLimit}
              onChange={e => setNewLimit(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Pricing: 1-10 users = Starter · 11-50 = Pro · 51+ = Enterprise
            </p>
          </div>
          <div className={`p-3 rounded-lg text-xs font-medium ${
            newLimit <= 10 ? "bg-gray-100 text-gray-600" :
            newLimit <= 50 ? "bg-blue-50 text-blue-700" :
            "bg-purple-50 text-purple-700"
          }`}>
            {newLimit <= 10 ? "📦 Starter Plan — up to 10 users" :
             newLimit <= 50 ? "⭐ Pro Plan — up to 50 users" :
             "🚀 Enterprise Plan — unlimited users"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={async () => {
            try {
              await api.patch(`/admin/companies/${company.id}/limits`, {
                max_users: newLimit
              });
              toast.success(`User limit updated to ${newLimit} for ${company.name}`);
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["admin-user-limits"] });
              qc.invalidateQueries({ queryKey: ["admin-summary"] });
            } catch {
              toast.error("Failed to update limit");
            }
          }}>
            Save Limit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function generateTempPassword() {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "@#$!";
  const base = [
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  const all = upper + lower + digits + special;
  for (let i = 0; i < 7; i++) base.push(all[Math.floor(Math.random() * all.length)]);
  return base.sort(() => Math.random() - 0.5).join('');
}

function AddCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [createdUser, setCreatedUser] = useState<{ email: string } | null>(null);
  const [tempPassword, setTempPassword] = useState("");

  const [company, setCompany] = useState({ name: "", code: "", gstin: "", phone: "", email: "" });
  const [mill, setMill] = useState({ name: "", code: "", city: "", state: "" });
  const [plan, setPlan] = useState({ plan: "starter", max_users: 10, max_employees: 100 });
  const [modules, setModules] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_MODULES.map(m => [m, true]))
  );
  const [owner, setOwner] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const PLANS = [
    { value: "starter", label: "Starter", price: "₹3,50,000", maxEmp: 100, maxUsers: 10, desc: "Up to 100 employees" },
    { value: "growth", label: "Growth", price: "₹7,50,000", maxEmp: 300, maxUsers: 25, desc: "Up to 300 employees" },
    { value: "business", label: "Business", price: "₹15,00,000", maxEmp: 600, maxUsers: 50, desc: "Up to 600 employees" },
    { value: "enterprise", label: "Enterprise", price: "₹28,00,000", maxEmp: 1500, maxUsers: 100, desc: "Up to 1500 employees" },
    { value: "unlimited", label: "Unlimited", price: "₹45,00,000", maxEmp: 99999, maxUsers: 250, desc: "Unlimited employees" },
  ];

  const handlePlanChange = (planValue: string) => {
    const p = PLANS.find(x => x.value === planValue);
    if (p) setPlan({ plan: planValue, max_users: p.maxUsers, max_employees: p.maxEmp });
  };

  const resetAll = () => {
    setStep(0); setLoading(false); setCreatedUser(null);
    setCompany({ name: "", code: "", gstin: "", phone: "", email: "" });
    setMill({ name: "", code: "", city: "", state: "" });
    setPlan({ plan: "starter", max_users: 10, max_employees: 100 });
    setModules(Object.fromEntries(ALL_MODULES.map(m => [m, true])));
    setOwner({ name: "", email: "" });
    setErrors({});
  };

  const handleNext = () => {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!company.name.trim()) errs.name = "Company name is required";
      if (!company.code.trim()) errs.code = "Company code is required";
      const g = company.gstin.trim();
      if (g && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.toUpperCase())) {
        errs.gstin = "Invalid GSTIN format";
      }
    } else if (step === 1) {
      if (!mill.name.trim()) errs.millName = "Mill name is required";
      if (!mill.code.trim()) errs.millCode = "Mill code is required";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    if (!owner.name.trim() || !owner.email.trim()) {
      setErrors({ owner: "Mill owner name and email are required" });
      return;
    }
    setLoading(true);
    try {
      const comp = await mastersApi.createCompany({
        code: company.code.trim(), name: company.name.trim(),
        gstin: company.gstin.trim() || undefined,
        phone: company.phone.trim() || undefined,
        email: company.email.trim() || undefined,
      });
      const companyId = comp.id ?? comp._id;

      await mastersApi.createMill({
        company_id: companyId,
        code: mill.code.trim(),
        name: mill.name.trim(),
        city: mill.city.trim() || undefined,
        state: mill.state.trim() || undefined,
      });

      const enabledMods = Object.entries(modules).filter(([, v]) => v).map(([k]) => k);
      if (enabledMods.length > 0) {
        await adminApi.createCompanyModules(companyId, enabledMods);
      }

      await api.patch(`/admin/companies/${companyId}/limits`, {
        max_users: plan.max_users,
        max_employees: plan.max_employees,
        plan: plan.plan,
      });

      const pw = generateTempPassword();
      setTempPassword(pw);
      const user = await api.post("/users", {
        full_name: owner.name.trim(),
        email: owner.email.trim(),
        password: pw,
        role: "MILL_OWNER",
        company_id: companyId,
        mill_id: null,
      }).then(r => r.data);

      setCreatedUser({ email: user.email });
      setStep(3);
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["system-users"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Onboarding failed");
    } finally {
      setLoading(false);
    }
  };

  const copyCredentials = async () => {
    const text = `Login: https://spinflow-f.onrender.com\nEmail: ${createdUser?.email}\nPassword: ${tempPassword}`;
    try { await navigator.clipboard.writeText(text); toast.success("Credentials copied"); }
    catch { toast.error("Failed to copy"); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetAll(); onOpenChange(false); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Onboard New Company</DialogTitle>
          <DialogDescription>3-step wizard to create company, mill, and first user.</DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        {step < 3 && (
          <div className="flex items-center gap-2 mb-4">
            {["Company", "Mill", "Plan & Access"].map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                  step > i ? "bg-blue-600 text-white" :
                  step === i ? "bg-blue-100 text-blue-700 ring-2 ring-blue-500" :
                  "bg-gray-100 text-gray-400"
                )}>
                  {step > i ? <Check className="w-3 h-3" /> : i + 1}
                </div>
                <span className={cn(
                  "text-sm font-medium",
                  step === i ? "text-blue-700" : "text-gray-400"
                )}>
                  {s}
                </span>
                {i < 2 && <ChevronRight className="w-4 h-4 text-gray-300" />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Company Details */}
        {step === 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Company Name <span className="text-destructive">*</span></Label>
              <Input value={company.name} onChange={e => { setCompany({ ...company, name: e.target.value }); if (!company.code) setCompany(c => ({ ...c, code: e.target.value.slice(0, 3).toUpperCase() })); }} placeholder="e.g. AA Yarn Mills Pvt Ltd" />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Company Code <span className="text-destructive">*</span></Label>
              <Input value={company.code} onChange={e => setCompany({ ...company, code: e.target.value.toUpperCase() })} placeholder="e.g. AAY" />
              {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input value={company.gstin} onChange={e => setCompany({ ...company, gstin: e.target.value })} placeholder="15 alphanumeric chars" />
              {errors.gstin && <p className="text-xs text-destructive">{errors.gstin}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={company.phone} onChange={e => setCompany({ ...company, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={company.email} onChange={e => setCompany({ ...company, email: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleNext}>Next: Mill Setup</Button>
            </div>
          </div>
        )}

        {/* Step 2: Mill Setup */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Mill Name <span className="text-destructive">*</span></Label>
              <Input value={mill.name} onChange={e => { setMill({ ...mill, name: e.target.value }); if (!mill.code) setMill(c => ({ ...c, code: e.target.value.slice(0, 3).toUpperCase() })); }} placeholder="e.g. AA Yarn Unit 1" />
              {errors.millName && <p className="text-xs text-destructive">{errors.millName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Mill Code <span className="text-destructive">*</span></Label>
              <Input value={mill.code} onChange={e => setMill({ ...mill, code: e.target.value.toUpperCase() })} placeholder="e.g. AYU1" />
              {errors.millCode && <p className="text-xs text-destructive">{errors.millCode}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={mill.city} onChange={e => setMill({ ...mill, city: e.target.value })} placeholder="e.g. Coimbatore" />
              </div>
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input value={mill.state} onChange={e => setMill({ ...mill, state: e.target.value })} placeholder="e.g. Tamil Nadu" />
              </div>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={handleNext}>Next: Plan & User</Button>
            </div>
          </div>
        )}

        {/* Step 3: Plan & First User */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Plan</label>
              <div className="grid grid-cols-1 gap-2">
                {PLANS.map(p => (
                  <label key={p.value}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer",
                      "transition-all duration-150",
                      plan.plan === p.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-slate-700 hover:border-blue-300"
                    )}>
                    <input type="radio" name="plan" value={p.value}
                      checked={plan.plan === p.value}
                      onChange={() => handlePlanChange(p.value)}
                      className="sr-only" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-gray-900 dark:text-white">{p.label}</span>
                        <span className="text-xs text-gray-500">{p.desc}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{p.maxUsers} users max</div>
                    </div>
                    <span className={cn("font-bold text-sm", plan.plan === p.value ? "text-blue-600" : "text-gray-500")}>
                      {p.price}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Modules</Label>
              <p className="text-xs text-gray-400 mb-2">Select modules to enable for this company</p>
              <div className="grid grid-cols-2 gap-2">
                {ALL_MODULES.map(mod => (
                  <div key={mod} className="flex items-center justify-between p-2 rounded-md border border-gray-100">
                    <span className="text-xs font-medium">{MODULE_LABELS[mod]}</span>
                    <Switch checked={modules[mod]} onCheckedChange={v => setModules(p => ({ ...p, [mod]: v }))} />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t pt-3">
              <Label className="text-sm font-semibold">Mill Owner Account</Label>
              <div className="space-y-2 mt-2">
                <Input value={owner.name} onChange={e => setOwner({ ...owner, name: e.target.value })} placeholder="Owner name" />
                <Input type="email" value={owner.email} onChange={e => setOwner({ ...owner, email: e.target.value })} placeholder="Owner email" />
              </div>
              {errors.owner && <p className="text-xs text-destructive mt-1">{errors.owner}</p>}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? "Onboarding…" : "Complete Onboarding"}
              </Button>
            </div>
          </div>
        )}

        {/* Success Screen */}
        {step === 3 && (
          <div className="text-center space-y-4 py-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-semibold">Company onboarded successfully!</h3>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
              <p className="text-sm font-semibold text-blue-800 mb-3">
                Share these credentials with the mill owner:
              </p>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Login URL:</span>
                  <span className="text-blue-700">https://spinflow-f.onrender.com</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Email:</span>
                  <span className="font-semibold">{createdUser?.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Password:</span>
                  <span className="font-semibold text-green-700">{tempPassword}</span>
                </div>
              </div>
              <p className="text-xs text-blue-600 mt-3">
                ⚠️ User will be asked to change password on first login
              </p>
            </div>

            <div className="flex gap-3 justify-center">
              <Button onClick={copyCredentials} variant="outline">
                <Copy className="w-4 h-4 mr-2" /> Copy Credentials
              </Button>
              <Button onClick={() => { resetAll(); onOpenChange(false); }}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter — up to 100 employees (₹3,50,000)" },
  { value: "growth", label: "Growth — up to 300 employees (₹7,50,000)" },
  { value: "business", label: "Business — up to 600 employees (₹15,00,000)" },
  { value: "enterprise", label: "Enterprise — up to 1500 employees (₹28,00,000)" },
  { value: "unlimited", label: "Unlimited — 1500+ employees (₹45,00,000)" },
];

function EditCompanyDialog({ company, onClose, onDone }: { company: Company | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "", plan: "starter", max_employees: 100 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        gstin: company.gstin ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        plan: (company as any).plan ?? "starter",
        max_employees: (company as any).max_employees ?? 100,
      });
      setError("");
    }
  }, [company]);

  const handleSave = async () => {
    if (!company) return;
    if (!form.name.trim()) { setError("Name is required"); return; }
    const gstin = form.gstin.trim();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
      setError("Invalid GSTIN format");
      return;
    }
    setLoading(true);
    try {
      await mastersApi.updateCompany(company.id, {
        name: form.name.trim(),
        gstin: gstin || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      });
      await api.patch(`/admin/companies/${company.id}/limits`, {
        max_users: company.max_users ?? 50,
        plan: form.plan,
        max_employees: form.max_employees,
      });
      toast.success("Company updated");
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={!!company} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Company — {company?.name}</DialogTitle>
        </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>GSTIN</Label>
              <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Plan</Label>
              <select
                value={form.plan}
                onChange={(e) => setForm({ ...form, plan: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800"
              >
                {PLAN_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Max Employees</Label>
              <input
                type="number"
                value={form.max_employees}
                onChange={(e) => setForm({ ...form, max_employees: parseInt(e.target.value) || 100 })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const CORE_MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "📊" },
  { key: "production", label: "Production", icon: "🏭" },
  { key: "quality", label: "Quality Control", icon: "✅" },
  { key: "maintenance", label: "Maintenance", icon: "🔧" },
  { key: "hr", label: "Human Resources", icon: "👥" },
  { key: "payroll", label: "Payroll", icon: "₹" },
  { key: "purchase", label: "Cotton Purchase", icon: "📦" },
  { key: "stores", label: "Stores & Spares", icon: "🏪" },
  { key: "inventory", label: "Inventory", icon: "📋" },
  { key: "dispatch", label: "Dispatch", icon: "🚛" },
  { key: "accounts", label: "Accounts", icon: "📒" },
  { key: "sales", label: "Sales", icon: "📈" },
  { key: "masters", label: "Masters", icon: "⚙️" },
  { key: "users", label: "Users & Roles", icon: "👤" },
  { key: "reports", label: "Reports", icon: "📄" },
];

const ADDON_MODULES = [
  { key: "lotrac", label: "LoTrac", desc: "QR-based sack tracking & delivery confirmation", price: "₹1,999/mo" },
  { key: "whatsapp", label: "WhatsApp Alerts", desc: "Machine down, low stock, daily MIS report at 6 PM", price: "₹2,999/mo" },
  { key: "lc_tracking", label: "LC Tracking", desc: "Letter of Credit management with expiry alerts", price: "₹999/mo" },
  { key: "analytics", label: "Advanced Analytics", desc: "Lot traceability, P&L dashboard, efficiency benchmarks", price: "₹1,499/mo" },
];

function ModulesDialog({ company, onClose, onDone }: { company: Company | null; onClose: () => void; onDone: () => void }) {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (company) {
      (async () => {
        try {
          const data = await adminApi.getCompanyModules(company.id);
          setModules(data);
        } catch {
          toast.error("Failed to load modules");
        }
      })();
    }
  }, [company]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateCompanyModules(company!.id, modules);
      toast.success(`Modules updated for ${company!.name}`);
      onDone();
    } catch {
      toast.error("Failed to save modules. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!company} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Module Access — {company?.name}</DialogTitle>
          <DialogDescription>
            Toggle which modules this company can access based on their plan.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Core Modules
            </span>
            <span className="text-xs text-gray-400">— included in licence</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CORE_MODULES.map(mod => (
              <div key={mod.key}
                className="flex items-center justify-between p-2.5 rounded-lg
                  border border-gray-100 dark:border-slate-700 hover:bg-gray-50
                  dark:hover:bg-slate-700/50">
                <span className="text-sm text-gray-700 dark:text-slate-300">
                  {mod.icon} {mod.label}
                </span>
                <Switch
                  checked={modules[mod.key] ?? false}
                  onCheckedChange={v => setModules(p => ({...p, [mod.key]: v}))}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-blue-500">
              Add-On Modules
            </span>
            <span className="text-xs text-blue-500">— monthly billing</span>
          </div>
          <div className="space-y-2">
            {ADDON_MODULES.map(mod => (
              <div key={mod.key}
                className="flex items-center justify-between p-3 rounded-xl
                  border border-dashed border-blue-200 dark:border-blue-800
                  bg-blue-50/40 dark:bg-blue-900/10">
                <div className="flex-1 min-w-0 mr-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                      {mod.label}
                    </span>
                    <span className="text-xs font-bold text-blue-600 bg-blue-100
                      dark:bg-blue-900/40 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      {mod.price}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">
                    {mod.desc}
                  </p>
                </div>
                <Switch
                  checked={modules[mod.key] ?? false}
                  onCheckedChange={v => setModules(p => ({...p, [mod.key]: v}))}
                />
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Module Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



const ROLES_FOR_CREATE = [
  "MILL_OWNER", "GENERAL_MANAGER", "PRODUCTION_MANAGER", "QUALITY_MANAGER",
  "DISPATCH_MANAGER", "STORE_MANAGER", "HR_MANAGER", "ACCOUNTANT",
  "MAINTENANCE_MANAGER", "SUPERVISOR", "MACHINE_OPERATOR", "SECURITY_GATE", "AUDITOR",
];

function CreateUserDialog({ open, onOpenChange, companies, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  companies: any[]; onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ company_id: "", mill_id: "", role_code: "MILL_OWNER", full_name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; role: string; mill?: string } | null>(null);

  const { data: mills } = useQuery({
    queryKey: ["mills-for-company", form.company_id],
    queryFn: () => api.get(`/masters/mills?company_id=${form.company_id}`).then(r => r.data?.data ?? r.data?.items ?? []),
    enabled: !!form.company_id,
  });

  const pwChecks = [
    { label: "6+ chars", test: (p: string) => p.length >= 6 },
    { label: "Uppercase", test: (p: string) => /[A-Z]/.test(p) },
    { label: "Number", test: (p: string) => /\d/.test(p) },
    { label: "Special (!@#$)", test: (p: string) => /[!@#$%^&*]/.test(p) },
  ];

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { toast.error("Name is required"); return; }
    if (!form.email.trim() || !form.email.includes("@")) { toast.error("Valid email is required"); return; }
    if (!form.password || form.password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (form.password.length >= 8) {
      if (!/[A-Z]/.test(form.password)) { toast.error("Password must contain at least one uppercase letter"); return; }
      if (!/\d/.test(form.password)) { toast.error("Password must contain at least one number"); return; }
    }
    if (!form.company_id) { toast.error("Please select a company"); return; }
    setLoading(true);
    try {
      const res = await api.post("/users", {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role_code || "MILL_OWNER",
        company_id: form.company_id,
        mill_id: form.mill_id || null,
        mobile: form.phone.trim() || null,
      });
      setCreatedCredentials({
        email: res.data.email,
        password: form.password,
        role: res.data.role,
        mill: res.data.mill_name,
      });
      onOpenChange(false);
      setShowCredentials(true);
      setForm({ company_id: "", mill_id: "", role_code: "MILL_OWNER", full_name: "", email: "", password: "", phone: "" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      onDone();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: any) => d.msg || d.message || d).join(", ")
          : err?.message ?? "Failed to create user";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Create a user under any company.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Company <span className="text-destructive">*</span></Label>
              <select
                value={form.company_id}
                onChange={e => setForm({ ...form, company_id: e.target.value, mill_id: "" })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white dark:bg-slate-800"
              >
                <option value="">Select company...</option>
                {companies.filter(c => c?.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {form.company_id && (
              <div className="space-y-1.5">
                <Label>Mill</Label>
                <select
                  value={form.mill_id}
                  onChange={e => setForm({ ...form, mill_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white dark:bg-slate-800"
                >
                  <option value="">No mill (company-level)</option>
                  {(Array.isArray(mills) ? mills : []).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={form.role_code}
                onChange={e => setForm({ ...form, role_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white dark:bg-slate-800"
              >
                {ROLES_FOR_CREATE.map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-destructive">*</span></Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Password <span className="text-destructive">*</span></Label>
              <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {pwChecks.map(req => (
                  <span key={req.label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    req.test(form.password || "")
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-500"
                  }`}>
                    {req.test(form.password || "") ? "✓ " : ""}{req.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading}>{loading ? "Creating…" : "Create User"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCredentials && createdCredentials && (
        <Dialog open onOpenChange={() => setShowCredentials(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>User Created ✓</DialogTitle>
              <DialogDescription>Share these login credentials with the user</DialogDescription>
            </DialogHeader>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-4 space-y-2 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">URL:</span>
                <span className="text-blue-700 text-xs">spinflow-f.onrender.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Email:</span>
                <span className="font-semibold">{createdCredentials.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Password:</span>
                <span className="font-semibold text-green-700">{createdCredentials.password}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Role:</span>
                <span>{createdCredentials.role}</span>
              </div>
              {createdCredentials.mill && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Mill:</span>
                  <span>{createdCredentials.mill}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
              ⚠️ User will be forced to change password on first login
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                navigator.clipboard.writeText(
                  `Login: spinflow-f.onrender.com\nEmail: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
                );
                toast.success("Credentials copied!");
              }}>
                Copy Credentials
              </Button>
              <Button onClick={() => setShowCredentials(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}


function ModuleManagerTab() {
  const qc = useQueryClient();
  const companiesQ = useQuery({
    queryKey: ["masters", "companies"],
    queryFn: () => mastersApi.getCompanies(),
    staleTime: 60_000,
  });
  const companiesData = (companiesQ.data ?? []) as Company[];
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const modulesQ = useQuery({
    queryKey: ["company-modules", selectedCompanyId],
    queryFn: () => adminApi.getCompanyModules(selectedCompanyId),
    staleTime: 60_000,
    enabled: !!selectedCompanyId,
  });
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (modulesQ.data && !initialized) {
      setModules(modulesQ.data);
      setInitialized(true);
    }
  }, [modulesQ.data, initialized]);

  const updateM = useMutation({
    mutationFn: () => adminApi.updateCompanyModules(selectedCompanyId, modules),
    onSuccess: () => {
      toast.success("Modules updated");
      qc.invalidateQueries({ queryKey: ["company-modules", selectedCompanyId] });
    },
    onError: () => toast.error("Failed to update modules"),
  });

  const selectedCompany = companiesData.find((c) => c.id === selectedCompanyId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Module Manager</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Select value={selectedCompanyId} onValueChange={(v) => { setSelectedCompanyId(v); setInitialized(false); }}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Select a company" />
            </SelectTrigger>
            <SelectContent>
              {companiesData.filter((c) => c?.id).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!selectedCompanyId && (
          <p className="text-sm text-muted-foreground">Select a company to manage module access.</p>
        )}
        {selectedCompanyId && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {ALL_MODULES.map((mod) => (
                <div key={mod} className="flex items-center justify-between p-3 rounded-md border">
                  <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
                  <Switch
                    checked={modules[mod] ?? false}
                    disabled={updateM.isPending}
                    onCheckedChange={(v) => setModules((prev) => ({ ...prev, [mod]: v }))}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
              {updateM.isPending ? "Saving…" : "Save Module Access"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

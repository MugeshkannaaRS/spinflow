import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi, usersApi, auditApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

import { Topbar } from "@/components/layout/Topbar";
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

export const Route = createFileRoute("/_app/admin")({
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
  const [tab, setTab] = useState("companies");
  const [search, setSearch] = useState("");

  const [addCompanyOpen, setAddCompanyOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [modulesCompany, setModulesCompany] = useState<Company | null>(null);
  const [suspendCompany, setSuspendCompany] = useState<Company | null>(null);

  const handleSuspend = async (company: Company) => {
    try {
      const res = await adminApi.suspendCompany(company.id);
      const status = res.is_active ? "activated" : "suspended";
      toast.success(`${company.name} has been ${status}`);
      setSuspendCompany(null);
      qc.invalidateQueries({ queryKey: ["masters"] });
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
      Plan: c.subscription_plan || c.plan || "Pro",
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
        <Topbar title="Admin Panel" subtitle="Access denied" />
        <div className="p-6 text-destructive text-lg font-medium">
          Only Super Admin can access this page.
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Admin Panel" subtitle="Super admin control panel" />
      <div className="p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="companies">Companies</TabsTrigger>
              <TabsTrigger value="modules">Module Manager</TabsTrigger>
              <TabsTrigger value="limits">User Limits</TabsTrigger>
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
                        key: "subscription_plan",
                        label: "Plan",
                        render: (c: any) => (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            {c.subscription_plan || c.plan || "Pro"}
                          </span>
                        ),
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
                <EditCompanyDialog company={editCompany} onClose={() => setEditCompany(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["masters"] }); setEditCompany(null); }} />
                <ModulesDialog company={modulesCompany} onClose={() => setModulesCompany(null)} onDone={() => { qc.invalidateQueries({ queryKey: ["masters"] }); setModulesCompany(null); }} />
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

function AddCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: "", name: "", gstin: "", phone: "", email: "",
    max_users: 50, max_mills: 5, subscription_plan: "Pro",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!form.code.trim()) errs.code = "Code is required";
    if (!form.name.trim()) errs.name = "Name is required";
    const gstin = form.gstin.trim();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase())) {
      errs.gstin = "Invalid GSTIN format. Example: 29ABCDE1234F1Z5";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      const company = await mastersApi.createCompany({
        code: form.code.trim(), name: form.name.trim(),
        gstin: form.gstin.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        max_users: form.max_users, max_mills: form.max_mills,
        subscription_plan: form.subscription_plan,
      });
      const companyId = company.id ?? company._id;
      if (companyId) {
        await adminApi.createCompanyModules(companyId, ALL_MODULES);
      }
      toast.success("Company created with all modules enabled");
      qc.invalidateQueries({ queryKey: ["masters"] });
      onOpenChange(false);
      setForm({ code: "", name: "", gstin: "", phone: "", email: "", max_users: 50, max_mills: 5, subscription_plan: "Pro" });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
          <DialogDescription>Create a new company with all modules enabled.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="space-y-1.5">
            <Label>Code <span className="text-destructive">*</span></Label>
            <Input value={form.code} onChange={(e) => { setForm({ ...form, code: e.target.value }); setErrors({ ...errors, code: "" }); }} placeholder="e.g. SPIN001" />
            {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors({ ...errors, name: "" }); }} placeholder="e.g. SpinFlow Textiles Pvt Ltd" />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>GSTIN</Label>
            <Input value={form.gstin} onChange={(e) => { setForm({ ...form, gstin: e.target.value }); setErrors({ ...errors, gstin: "" }); }} placeholder="15 alphanumeric chars" />
            {errors.gstin && <p className="text-xs text-destructive">{errors.gstin}</p>}
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Max Users</Label>
              <Input type="number" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Max Mills</Label>
              <Input type="number" value={form.max_mills} onChange={(e) => setForm({ ...form, max_mills: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Subscription Plan</Label>
            <Select value={form.subscription_plan} onValueChange={(v) => setForm({ ...form, subscription_plan: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Basic">Basic</SelectItem>
                <SelectItem value="Pro">Pro</SelectItem>
                <SelectItem value="Enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={loading || !form.code || !form.name}>
              {loading ? "Creating…" : "Create Company"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditCompanyDialog({ company, onClose, onDone }: { company: Company | null; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: "", gstin: "", phone: "", email: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (company) {
      setForm({ name: company.name ?? "", gstin: company.gstin ?? "", phone: company.phone ?? "", email: company.email ?? "" });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Module Access — {company?.name}</DialogTitle>
          <DialogDescription>Toggle which modules this company can access.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-4">
          {ALL_MODULES.map((mod) => (
            <div key={mod} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-700">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{MODULE_LABELS[mod]}</span>
              <Switch checked={modules[mod] ?? false} onCheckedChange={(val) => setModules((prev) => ({ ...prev, [mod]: val }))} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Module Access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

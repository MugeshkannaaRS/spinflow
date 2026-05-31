import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi, usersApi, auditApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { validateForm, GSTIN_REGEX } from "@/lib/formValidation";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Blocks,
  Ban,
  Search,
  Pencil,
} from "lucide-react";
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
                  <Dialog open={addCompanyOpen} onOpenChange={setAddCompanyOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="size-4 mr-1" /> Add Company
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add Company</DialogTitle>
                        <DialogDescription>Create a new company with all modules enabled.</DialogDescription>
                      </DialogHeader>
                      <AddCompanyForm onDone={() => { setAddCompanyOpen(false); qc.invalidateQueries({ queryKey: ["masters"] }); }} />
                    </DialogContent>
                  </Dialog>
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
                      { key: "subscription_plan", label: "Plan", render: (c: any) => <Badge variant="outline">{c.subscription_plan ?? "Pro"}</Badge> },
                      {
                        key: "is_active",
                        label: "Status",
                        type: "status",
                        render: (c: any) => (
                          <Badge variant={c.is_active ? "default" : "secondary"}>
                            {c.is_active ? "Active" : "Suspended"}
                          </Badge>
                        ),
                      },
                    ] satisfies ColDef[]}
                    data={companiesData}
                    rowKey={(c: any) => c.id}
                    exportFilename="admin_companies"
                    actions={(item: any) => (
                      <div className="flex gap-1">
                        <Sheet>
                          <SheetTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Pencil className="size-3.5 mr-1" /> Edit
                            </Button>
                          </SheetTrigger>
                          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                            <SheetHeader>
                              <SheetTitle>Edit Company — {item.name}</SheetTitle>
                            </SheetHeader>
                            <div className="mt-4">
                              <EditCompanyForm item={item} onDone={() => { qc.invalidateQueries({ queryKey: ["masters"] }); }} />
                            </div>
                          </SheetContent>
                        </Sheet>
                        <CompanyModulesSheet company={item} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          onClick={() => {
                            mastersApi.updateCompany(item.id, { is_active: false }).then(() => {
                              toast.success("Company suspended");
                              qc.invalidateQueries({ queryKey: ["masters", "companies"] });
                            }).catch(() => toast.error("Failed to suspend company"));
                          }}
                        >
                          <Ban className="size-3.5 mr-1" /> Suspend
                        </Button>
                      </div>
                    )}
                  />
                </CardContent>
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
                          const max = 50;
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
  const [maxUsers, setMaxUsers] = useState(company.max_users ?? 50);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await mastersApi.updateCompany(company.id, { max_users: maxUsers });
      toast.success("User limit updated");
      qc.invalidateQueries({ queryKey: ["masters"] });
      setOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update limit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5 mr-1" /> Edit Limit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User Limit — {company.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Max Users</Label>
          <Input type="number" value={maxUsers} onChange={(e) => setMaxUsers(parseInt(e.target.value) || 0)} />
        </div>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AddCompanyForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    name: "",
    gstin: "",
    phone: "",
    email: "",
    max_users: 50,
    max_mills: 5,
    subscription_plan: "Pro",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async () => {
    const errs = validateForm(form, {
      code: { required: true, minLength: 2 },
      name: { required: true, minLength: 2 },
      gstin: { pattern: GSTIN_REGEX, patternMessage: "Invalid GSTIN format" },
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      const company = await mastersApi.createCompany({
        code: form.code,
        name: form.name,
        gstin: form.gstin || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        max_users: form.max_users,
        max_mills: form.max_mills,
        subscription_plan: form.subscription_plan,
      });
      const companyId = company.id ?? company._id;
      if (companyId) {
        await adminApi.createCompanyModules(companyId, ALL_MODULES);
      }
      toast.success("Company created with all modules enabled");
      qc.invalidateQueries({ queryKey: ["masters"] });
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 mt-4">
      <div className="space-y-1.5">
        <Label>Code <span className="text-destructive">*</span></Label>
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. SPIN001" />
      </div>
      <div className="space-y-1.5">
        <Label>Name <span className="text-destructive">*</span></Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SpinFlow Textiles Pvt Ltd" />
      </div>
      <div className="space-y-1.5">
        <Label>GSTIN</Label>
        <Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} placeholder="15 alphanumeric chars" />
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
      <Button className="w-full mt-4" onClick={handleSubmit} disabled={loading || !form.code || !form.name}>
        {loading ? "Creating…" : "Create Company"}
      </Button>
    </div>
  );
}

function EditCompanyForm({ item, onDone }: { item: Company; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    code: item.code ?? "",
    name: item.name ?? "",
    gstin: item.gstin ?? "",
    phone: item.phone ?? "",
    email: item.email ?? "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const errs = validateForm(form, {
      code: { required: true, minLength: 2 },
      name: { required: true, minLength: 2 },
      gstin: { pattern: GSTIN_REGEX, patternMessage: "Invalid GSTIN format" },
    });
    if (Object.keys(errs).length > 0) {
      toast.error(Object.values(errs).join(", "));
      return;
    }
    setLoading(true);
    try {
      await mastersApi.updateCompany(item.id, form);
      toast.success("Company updated");
      qc.invalidateQueries({ queryKey: ["masters"] });
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Code</Label>
        <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label>Name</Label>
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
      <SheetFooter>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Saving…" : "Save"}
        </Button>
      </SheetFooter>
    </div>
  );
}

function CompanyModulesSheet({ company }: { company: Company }) {
  const qc = useQueryClient();
  const modulesQ = useQuery({
    queryKey: ["company-modules", company.id],
    queryFn: () => adminApi.getCompanyModules(company.id),
    staleTime: 60_000,
  });
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [initialized, setInitialized] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (modulesQ.data && !initialized) {
      setModules(modulesQ.data);
      setInitialized(true);
    }
  }, [modulesQ.data, initialized]);

  const updateM = useMutation({
    mutationFn: () => adminApi.updateCompanyModules(company.id, modules),
    onSuccess: () => {
      toast.success("Modules updated");
      qc.invalidateQueries({ queryKey: ["company-modules", company.id] });
      setOpen(false);
    },
    onError: () => toast.error("Failed to update modules"),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setOpen(false); setInitialized(false); } }}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" onClick={() => { setOpen(true); setInitialized(false); }}>
          <Blocks className="size-3.5 mr-1" /> Modules
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Modules — {company.name}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {ALL_MODULES.map((mod) => (
            <div key={mod} className="flex items-center justify-between py-2 border-b last:border-0">
              <Label>{MODULE_LABELS[mod]}</Label>
              <Switch
                checked={modules[mod] ?? false}
                disabled={updateM.isPending}
                onCheckedChange={(v) => setModules((prev) => ({ ...prev, [mod]: v }))}
              />
            </div>
          ))}
          <SheetFooter>
            <Button onClick={() => updateM.mutate()} disabled={updateM.isPending}>
              {updateM.isPending ? "Saving…" : "Save Module Access"}
            </Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
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

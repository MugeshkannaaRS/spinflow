import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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

import { useState, useMemo } from "react";
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
import { cn } from "@/lib/utils";
import { generateCodeFromName } from "@/lib/company-utils";
import type { Company } from "@/lib/types";

export const Route = createFileRoute("/_app/admin/companies")({
  head: () => ({ meta: [{ title: "Companies — Admin — SpinFlow ERP" }] }),
  component: CompaniesPage,
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

const PLAN_OPTIONS = [
  { value: "starter", label: "Starter — up to 100 employees (\u20B93,50,000)" },
  { value: "growth", label: "Growth — up to 300 employees (\u20B97,50,000)" },
  { value: "business", label: "Business — up to 600 employees (\u20B915,00,000)" },
  { value: "enterprise", label: "Enterprise — up to 1500 employees (\u20B928,00,000)" },
  { value: "unlimited", label: "Unlimited — 1500+ employees (\u20B945,00,000)" },
];

const CORE_MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "\uD83D\uDCCA" },
  { key: "production", label: "Production", icon: "\uD83C\uDFED" },
  { key: "quality", label: "Quality Control", icon: "\u2705" },
  { key: "maintenance", label: "Maintenance", icon: "\uD83D\uDD27" },
  { key: "hr", label: "Human Resources", icon: "\uD83D\uDC65" },
  { key: "payroll", label: "Payroll", icon: "\u20B9" },
  { key: "purchase", label: "Cotton Purchase", icon: "\uD83D\uDCE6" },
  { key: "stores", label: "Stores & Spares", icon: "\uD83C\uDFEA" },
  { key: "inventory", label: "Inventory", icon: "\uD83D\uDCCB" },
  { key: "dispatch", label: "Dispatch", icon: "\uD83D\uDE9B" },
  { key: "accounts", label: "Accounts", icon: "\uD83D\uDCD2" },
  { key: "sales", label: "Sales", icon: "\uD83D\uDCC8" },
  { key: "masters", label: "Masters", icon: "\u2699\uFE0F" },
  { key: "users", label: "Users & Roles", icon: "\uD83D\uDC64" },
  { key: "reports", label: "Reports", icon: "\uD83D\uDCC4" },
];

const ADDON_MODULES = [
  { key: "lotrac", label: "LoTrac", desc: "QR-based sack tracking & delivery confirmation", price: "\u20B91,999/mo" },
  { key: "whatsapp", label: "WhatsApp Alerts", desc: "Machine down, low stock, daily MIS report at 6 PM", price: "\u20B92,999/mo" },
  { key: "lc_tracking", label: "LC Tracking", desc: "Letter of Credit management with expiry alerts", price: "\u20B9999/mo" },
  { key: "analytics", label: "Advanced Analytics", desc: "Lot traceability, P&L dashboard, efficiency benchmarks", price: "\u20B91,499/mo" },
];

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

function CompaniesPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [modulesCompany, setModulesCompany] = useState<Company | null>(null);
  const [suspendCompany, setSuspendCompany] = useState<Company | null>(null);

  const handleSuspend = async (company: Company) => {
    try {
      const targetStatus = company.is_active ? "suspended" : "active";
      const res = await adminApi.suspendCompany(company.id, targetStatus);
      toast.success(`${company.name} has been ${res.status}`);
      setSuspendCompany(null);
      qc.invalidateQueries({ queryKey: ["masters"] });
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["admin-billing-companies"] });
    } catch {
      toast.error("Failed to update company status");
    }
  };

  const handleExport = () => {
    const rows = companiesData.map((c) => ({
      Code: c.code,
      "Company Name": c.name,
      GSTIN: c.gstin || "\u2014",
      Phone: c.phone || "\u2014",
      Email: c.email || "\u2014",
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
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
    retry: 1,
  });
  const statsQ = useQuery({
    queryKey: ["admin-company-stats"],
    queryFn: () => adminApi.getCompanyStats(),
    staleTime: 30_000,
    retry: 1,
  });

  const companiesData = (companiesQ.data ?? []) as Company[];
  const companyStats: any[] = statsQ.data ?? [];

  const companyUserCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of companyStats) {
      counts[s.company_id] = (s.user_count ?? 0);
    }
    return counts;
  }, [companyStats]);

  const companyMillCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of companyStats) {
      counts[s.company_id] = (s.mill_count ?? 0);
    }
    return counts;
  }, [companyStats]);

  const activeCompanies = companiesData.filter((c: any) => c.is_active !== false);

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Active Companies ({activeCompanies.length})</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="size-4 mr-1" /> Export
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin/companies/onboard">
                <Plus className="size-4 mr-1" /> Add Company
              </Link>
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
            data={activeCompanies}
            rowKey={(c: any) => c.id}
            onRowClick={(c: any) => navigate({ to: "/admin/companies/$companyId", params: { companyId: c.id } })}
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
                  className="text-red-600 hover:bg-red-50 border-red-200"
                  onClick={() => setSuspendCompany(item)}
                >
                  {item.is_active ? <Ban className="size-3.5 mr-1" /> : <CheckCircle className="size-3.5 mr-1" />}
                  {item.is_active ? "Suspend" : "Activate"}
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
      </Card>
    </div>
  );
}

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
          <DialogTitle>Edit Company \u2014 {company?.name}</DialogTitle>
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
              {loading ? "Saving\u2026" : "Save"}
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
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Module Access \u2014 {company?.name}</DialogTitle>
          <DialogDescription>
            Toggle which modules this company can access based on their plan.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Core Modules
            </span>
            <span className="text-xs text-gray-400">\u2014 included in licence</span>
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
            <span className="text-xs text-blue-500">\u2014 monthly billing</span>
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

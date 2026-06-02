import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { mastersApi, adminApi } from "@/lib/api-service";
import { Building2, Factory, Users, UserCheck, Plus, Settings, RefreshCw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MODULE_LABELS: Record<string, string> = {
  dashboard: "Dashboard", production: "Production", quality: "Quality",
  stock: "Stock", inventory: "Inventory", lotrac: "LoTrac", dispatch: "Dispatch",
  purchase: "Purchase", stores: "Stores", hr: "HR", payroll: "Payroll",
  accounts: "Accounts", maintenance: "Maintenance", reports: "Reports",
  audit: "Audit", users: "Users", masters: "Masters",
};
const ALL_MODULES = Object.keys(MODULE_LABELS);

export function SuperAdminDashboard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showAddCompany, setShowAddCompany] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-summary"],
    queryFn: () => api.get("/dashboard/admin-summary").then(r => r.data),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });

  const stats = [
    { label: "Companies", value: data?.total_companies ?? 0, icon: Building2, bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-600" },
    { label: "Mills", value: data?.total_mills ?? 0, icon: Factory, bg: "bg-blue-50 dark:bg-blue-900/30", color: "text-blue-600" },
    { label: "Total Users", value: data?.total_users ?? 0, icon: Users, bg: "bg-emerald-50 dark:bg-emerald-900/30", color: "text-emerald-600" },
    { label: "Employees", value: data?.total_employees ?? 0, icon: UserCheck, bg: "bg-orange-50 dark:bg-orange-900/30", color: "text-orange-600" },
  ];

  return (
    <div className="space-y-6 p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SpinFlow Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Manage companies, mills and subscriptions</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-100 dark:border-slate-700 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{stat.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.bg}`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {isLoading ? "—" : stat.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => navigate({ to: "/admin", search: { tab: "companies", action: "add" } as any })}
          className="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-4 transition-colors w-full text-left">
          <Plus className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold text-sm">Add New Company</div>
            <div className="text-xs text-blue-200">Onboard a new mill customer</div>
          </div>
        </button>
        <button onClick={() => navigate({ to: "/admin", search: { tab: "modules" } as any })}
          className="flex items-center gap-3 bg-white dark:bg-slate-800 hover:bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4 transition-colors w-full text-left">
          <Settings className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">Manage Modules</div>
            <div className="text-xs text-gray-500">Configure company access</div>
          </div>
        </button>
        <button onClick={() => navigate({ to: "/admin", search: { tab: "users" } as any })}
          className="flex items-center gap-3 bg-white dark:bg-slate-800 hover:bg-gray-50 border border-gray-200 dark:border-slate-700 rounded-xl px-5 py-4 transition-colors w-full text-left">
          <Users className="w-5 h-5 text-gray-500 shrink-0" />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-white">Manage Users</div>
            <div className="text-xs text-gray-500">View all users across mills</div>
          </div>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Active Companies</h3>
          <button onClick={() => navigate({ to: "/admin", search: { tab: "companies" } as any })}
            className="text-xs text-blue-600 hover:underline">
            View all →
          </button>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
          {isLoading ? (
            [1,2,3].map(i => (
              <div key={i} className="px-5 py-4 animate-pulse">
                <div className="h-4 bg-gray-100 dark:bg-slate-700 rounded w-1/3" />
              </div>
            ))
          ) : !data?.companies?.length ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              No companies yet. Add your first customer.
            </div>
          ) : (
            data.companies.map((company: any) => (
              <div key={company.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{company.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Code: {company.code}</div>
                </div>
                <button
                  onClick={() => navigate({ to: "/admin", search: { tab: "companies", company: company.id } as any })}
                  className="text-xs text-blue-600 hover:underline font-medium"
                >
                  Manage →
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={showAddCompany} onOpenChange={setShowAddCompany}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Company</DialogTitle>
          </DialogHeader>
          <AddCompanyForm onDone={() => { setShowAddCompany(false); qc.invalidateQueries({ queryKey: ["admin-summary"] }); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddCompanyForm({ onDone }: { onDone: () => void }) {
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
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setLoading(true);
    try {
      const company = await mastersApi.createCompany({
        code: form.code, name: form.name,
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
      qc.invalidateQueries({ queryKey: ["admin-summary"] });
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 mt-2">
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
      <Button className="w-full" onClick={handleSubmit} disabled={loading || !form.code || !form.name}>
        {loading ? "Creating…" : "Create Company"}
      </Button>
    </div>
  );
}

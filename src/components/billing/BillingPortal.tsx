import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useMillSubscription, useUpdateCurrency } from "@/hooks/useMillConfig";
import { setCurrencySymbol } from "@/lib/formatters";
import { api } from "@/lib/api";
import { useAuth, type CompanyMill } from "@/stores/auth";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { fmtLakh, fmtDate } from "@/lib/formatters";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, Building2, Users, Package, CheckCircle2,
  XCircle, AlertTriangle, ChevronDown, ChevronUp, Loader2,
  Factory, BadgeCheck, Wrench, Banknote, ShoppingCart,
  Warehouse, Boxes, Truck, QrCode, Receipt, Settings2,
  UserCog, SlidersHorizontal, Plus, ArrowUp, Download,
  ShoppingBag,
} from "lucide-react";

const MODULE_ICONS: Record<string, React.ElementType> = {
  production: Factory, quality: BadgeCheck, maintenance: Wrench,
  hr: Users, payroll: Banknote, purchase: ShoppingCart,
  stores: Warehouse, inventory: Boxes, dispatch: Truck,
  lotrac: QrCode, accounts: Receipt, sales: TrendingUp,
  masters: Settings2, users: UserCog, column_config: SlidersHorizontal,
};

const PLAN_BADGE: Record<string, string> = {
  starter:      "bg-slate-100 text-slate-600 border-slate-200",
  professional: "bg-blue-100 text-blue-700 border-blue-200",
  enterprise:   "bg-purple-100 text-purple-700 border-purple-200",
};

function PlanBadge({ plan }: { plan: string }) {
  const cls = PLAN_BADGE[plan?.toLowerCase()] ?? PLAN_BADGE.starter;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide", cls)}>
      {plan}
    </span>
  );
}

const ALL_MODULES = [
  "production","quality","maintenance","hr","payroll",
  "purchase","stores","inventory","dispatch","lotrac",
  "accounts","sales","masters","users","column_config",
];
const MODULE_LABELS: Record<string, string> = {
  production:"Production", quality:"Quality", maintenance:"Maintenance",
  hr:"Human Resources", payroll:"Payroll", purchase:"Cotton Purchase",
  stores:"Stores", inventory:"Inventory", dispatch:"Dispatch",
  lotrac:"LoTrac", accounts:"Accounts", sales:"Sales",
  masters:"Masters", users:"Users & Roles", column_config:"Column Config",
};

function ConfirmDialog({
  message, onConfirm, onCancel, danger = false,
}: {
  message: string; onConfirm: () => void; onCancel: () => void; danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
        <p className="text-[15px] text-[#0f172a] font-medium mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-[#d1d5db] text-[13px] font-medium text-[#374151] hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className={cn(
            "px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-colors",
            danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700",
          )}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

function ModulesCell({ modules }: { modules: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:text-blue-800 font-medium">
        {modules.length} modules
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-[#e2e8f0] rounded-lg shadow-lg p-2 min-w-40 max-h-48 overflow-y-auto">
            {modules.length === 0
              ? <p className="text-[12px] text-[#94a3b8] px-2 py-1">None enabled</p>
              : modules.map(m => (
                <div key={m} className="flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#374151]">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  {MODULE_LABELS[m] ?? m}
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}

function SuperAdminBillingView() {
  const qc = useQueryClient();
  const [modulesPopover, setModulesPopover] = useState<any>(null);
  // Close modules popover on outside click
  useEffect(() => {
    if (!modulesPopover) return;
    const h = () => setModulesPopover(null);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [!!modulesPopover]);
  const [confirmAction, setConfirmAction] = useState<{ message: string; fn: () => void; danger?: boolean } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const overviewQ = useQuery({
    queryKey: ["admin-billing-overview"],
    queryFn: () => api.get("/admin/billing/overview").then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const companiesQ = useQuery({
    queryKey: ["admin-billing-companies", page, search],
    queryFn: () => api.get("/admin/billing/companies", { params: { page, per_page: 20, search: search || undefined } }).then(r => r.data),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.post(`/admin/companies/${id}/status`, { status }),
    onSuccess: () => {
      toast.success("Status updated");
      qc.invalidateQueries({ queryKey: ["admin-billing-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: () => toast.error("Failed to update status"),
  });

  const ov = overviewQ.data;
  const comps: any[] = companiesQ.data?.companies ?? [];
  const total: number = companiesQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc]">
      <PageHeader
        title="Billing & Revenue"
        subtitle="Manage company subscriptions and module access"
        onRefresh={() => {
          qc.invalidateQueries({ queryKey: ["admin-billing-overview"] });
          qc.invalidateQueries({ queryKey: ["admin-billing-companies"] });
        }}
        isRefreshing={overviewQ.isFetching || companiesQ.isFetching}
      />

      <div className="p-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Monthly Recurring Revenue"
            value={fmtLakh(ov?.mrr ?? 0)}
            subLabel="Active subscriptions"
            icon={TrendingUp}
            iconColor="text-blue-600"
            iconBg="bg-blue-50"
          />
          <KpiCard
            label="Active Companies"
            value={String(ov?.active_companies ?? 0)}
            subLabel={`${ov?.total_companies ?? 0} total`}
            icon={Building2}
            iconColor="text-green-600"
            iconBg="bg-green-50"
          />
          <KpiCard
            label="Trial"
            value={String(ov?.trial_companies ?? 0)}
            subLabel="In trial period"
            icon={AlertTriangle}
            iconColor="text-amber-600"
            iconBg="bg-amber-50"
          />
          <KpiCard
            label="Overdue"
            value={String(ov?.overdue_companies ?? 0)}
            subLabel="Unpaid / expired"
            icon={XCircle}
            iconColor="text-red-600"
            iconBg="bg-red-50"
          />
        </div>

        {/* Revenue trend */}
        {(ov?.revenue_trend?.length ?? 0) > 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#0f172a] mb-4">Revenue Trend — Last 6 Months</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={ov.revenue_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtLakh(v)} />
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) =>
                    name === "revenue" ? [fmtLakh(v), "Revenue"] : [v, "New Companies"]
                  }
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area dataKey="revenue" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.12} name="revenue" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Companies table */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center gap-3">
            <h3 className="text-sm font-semibold text-[#0f172a] flex-1">Companies</h3>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search company…"
              className="px-3 py-1.5 rounded-lg border border-[#d1d5db] text-[13px] w-48 focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0]">
                  {["Company","Plan","Status","Mills","Users","Modules","Monthly ₹","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companiesQ.isLoading
                  ? [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-[#f1f5f9]">
                      {[...Array(8)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-[#e2e8f0] rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                  : comps.length === 0
                  ? (
                    <tr><td colSpan={8} className="text-center py-12 text-[#94a3b8]">No companies found</td></tr>
                  )
                  : comps.map((co: any) => (
                    <tr key={co.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#0f172a] text-[13px]">{co.name}</div>
                        <div className="text-[11px] text-[#94a3b8] font-mono">{co.code}</div>
                      </td>
                      <td className="px-4 py-3"><PlanBadge plan={co.plan} /></td>
                      <td className="px-4 py-3"><StatusBadge status={co.status} size="sm" /></td>
                      <td className="px-4 py-3 font-mono text-[#0f172a]">{co.mills_count}</td>
                      <td className="px-4 py-3 font-mono text-[#0f172a]">{co.users_count}</td>
                      <td className="px-4 py-3"><ModulesCell modules={co.enabled_modules} /></td>
                      <td className="px-4 py-3 font-mono text-[#0f172a]">{fmtLakh(co.monthly_amount)}</td>
                      <td className="px-4 py-3 relative">
                        <div className="flex items-center gap-1 flex-wrap">
                          {co.status !== "active" && (
                            <button
                              onClick={() => setConfirmAction({
                                message: `Activate "${co.name}"?`,
                                fn: () => statusMut.mutate({ id: co.id, status: "active" }),
                              })}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                            >
                              Activate
                            </button>
                          )}
                          {co.status !== "suspended" && (
                            <button
                              onClick={() => setConfirmAction({
                                message: `Suspend "${co.name}"? This will block all users.`,
                                fn: () => statusMut.mutate({ id: co.id, status: "suspended" }),
                                danger: true,
                              })}
                              className="px-2 py-1 rounded text-[11px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                            >
                              Suspend
                            </button>
                          )}
                          <button
                            onClick={() => setModulesPopover(modulesPopover?.id === co.id ? null : co)}
                            className="px-2 py-1 rounded text-[11px] font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                          >
                            Modules
                          </button>
                          {modulesPopover?.id === co.id && (
                            <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-[#e2e8f0] rounded-xl shadow-lg p-3 min-w-48 max-h-52 overflow-y-auto">
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8] mb-2">Enabled Modules</p>
                              {(co.enabled_modules ?? []).length === 0
                                ? <p className="text-[12px] text-[#94a3b8]">None enabled</p>
                                : co.enabled_modules.map((m: string) => (
                                  <div key={m} className="flex items-center gap-1.5 py-0.5 text-[12px] text-[#374151]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                                    {m.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                  </div>
                                ))
                              }
                              <a href="/admin/modules" className="block mt-2 text-[11px] text-blue-600 hover:underline border-t border-[#f1f5f9] pt-1.5">
                                Edit in Admin Panel →
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            </div>
          </div>
          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-[#e2e8f0] flex items-center justify-between text-[13px] text-[#64748b]">
              <span>Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, total)} of {total}</span>
              <div className="flex items-center gap-2">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 rounded border border-[#d1d5db] hover:bg-gray-50 disabled:opacity-40">Prev</button>
                <span className="font-mono">{page} / {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 rounded border border-[#d1d5db] hover:bg-gray-50 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Module editing moved to Admin Panel */}
      {confirmAction && (
        <ConfirmDialog
          message={confirmAction.message}
          danger={confirmAction.danger}
          onConfirm={() => { confirmAction.fn(); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

const CURRENCIES = [
  { symbol: "₹", code: "INR", label: "Indian Rupee" },
  { symbol: "$", code: "USD", label: "US Dollar" },
  { symbol: "€", code: "EUR", label: "Euro" },
  { symbol: "£", code: "GBP", label: "Pound" },
  { symbol: "৳", code: "BDT", label: "Taka" },
  { symbol: "₺", code: "TRY", label: "Lira" },
];

function OveragePurchaseDialog({
  open, onClose, planData,
}: {
  open: boolean; onClose: () => void; planData: any;
}) {
  const qc = useQueryClient();
  const [resource, setResource] = useState<"extra_users" | "extra_mills" | "extra_employees">("extra_users");
  const [qty, setQty] = useState(1);

  const unitPrice = resource === "extra_users"
    ? (planData?.additional_user_cost ?? 0)
    : resource === "extra_mills"
    ? (planData?.additional_mill_cost ?? 0)
    : (planData?.additional_employee_cost ?? 0);

  const total = unitPrice * qty;

  const purchaseMut = useMutation({
    mutationFn: (body: { resource_type: string; quantity: number }) =>
      api.post("/billing/purchase-overage", body).then(r => r.data),
    onSuccess: (res: any) => {
      toast.success(res.message);
      qc.invalidateQueries({ queryKey: ["billing-my-plan"] });
      qc.invalidateQueries({ queryKey: ["mill-subscription"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Purchase failed"),
  });

  if (!open) return null;

  const labels: Record<string, string> = {
    extra_users: "Additional Users",
    extra_mills: "Additional Mills",
    extra_employees: "Additional Employees",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
          <h2 className="text-[17px] font-bold text-[#0f172a]">Purchase Extra Capacity</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1.5">Resource Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(["extra_users", "extra_mills", "extra_employees"] as const).map(r => (
                <button key={r} onClick={() => { setResource(r); setQty(1); }}
                  className={cn("px-3 py-2 rounded-lg border text-[12px] font-medium text-center transition-all",
                    resource === r
                      ? "border-blue-400 bg-blue-50 text-blue-700"
                      : "border-[#e2e8f0] hover:border-blue-300 text-[#374151]")}
                >
                  {labels[r]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1">Quantity</label>
            <div className="flex items-center gap-2">
              <button onClick={() => setQty(Math.max(1, qty - 1))}
                className="w-8 h-8 rounded-lg border border-[#d1d5db] flex items-center justify-center text-lg font-medium hover:bg-gray-50">−</button>
              <input type="number" min={1} max={999} value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-10 text-center rounded-lg border border-[#d1d5db] text-[14px] font-mono focus:outline-none focus:border-blue-500" />
              <button onClick={() => setQty(Math.min(999, qty + 1))}
                className="w-8 h-8 rounded-lg border border-[#d1d5db] flex items-center justify-center text-lg font-medium hover:bg-gray-50">+</button>
              <span className="text-[13px] text-[#64748b] ml-2">× ₹{unitPrice.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-[12px] text-[#64748b]">Total</p>
            <p className="text-[24px] font-bold font-mono text-[#0f172a]">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#d1d5db] text-[13px] font-medium text-[#374151] hover:bg-gray-50">Cancel</button>
          <button onClick={() => purchaseMut.mutate({ resource_type: resource, quantity: qty })}
            disabled={purchaseMut.isPending || unitPrice <= 0}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2">
            {purchaseMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Purchase ₹{total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </button>
        </div>
      </div>
    </div>
  );
}

function UpgradeDialog({
  open, onClose, currentPlanId, companyName,
}: {
  open: boolean; onClose: () => void; currentPlanId?: string; companyName?: string;
}) {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [reason, setReason] = useState("");

  const plansQ = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => api.get("/subscription/plans").then(r => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const changeReqMut = useMutation({
    mutationFn: (body: { company_id: string; requested_plan_id: string; reason?: string }) => {
      const params = new URLSearchParams({ company_id: body.company_id });
      return api.post(`/subscription/change-requests?${params.toString()}`, {
        requested_plan_id: body.requested_plan_id,
        change_type: "upgrade",
        reason: body.reason,
      }).then(r => r.data);
    },
    onSuccess: () => {
      toast.success("Upgrade request submitted. Admin will review it.");
      qc.invalidateQueries({ queryKey: ["billing-my-plan"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to submit request"),
  });

  const { user } = useAuth();
  const companyId = user?.companyId;

  if (!open) return null;

  const plans = (Array.isArray(plansQ.data) ? plansQ.data : []).filter((p: any) => p.is_active && p.id !== currentPlanId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between shrink-0">
          <h2 className="text-[17px] font-bold text-[#0f172a]">Request Plan Upgrade</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
          <p className="text-[13px] text-[#64748b]">{companyName || "Your company"}</p>
          {plansQ.isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-20 bg-[#e2e8f0] rounded-lg animate-pulse" />)}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-[13px] text-[#94a3b8] text-center py-6">No other plans available</p>
          ) : (
            <div className="space-y-2">
              {plans.map((p: any) => (
                <button key={p.id} onClick={() => setSelectedPlanId(p.id)}
                  className={cn("w-full text-left p-4 rounded-lg border transition-all",
                    selectedPlanId === p.id
                      ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
                      : "border-[#e2e8f0] hover:border-blue-300")}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[14px] text-[#0f172a]">{p.name}</span>
                    <span className="font-mono font-bold text-[#0f172a]">₹{(p.monthly_price ?? 0).toLocaleString("en-IN")}/mo</span>
                  </div>
                  <p className="text-[12px] text-[#64748b] mt-1">
                    {p.included_users} users · {p.included_mills} mills · {p.description || ""}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="block text-[13px] font-semibold text-[#374151] mb-1">Reason (optional)</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)}
              placeholder="Why are you upgrading?"
              className="w-full h-20 px-3 py-2 rounded-lg border border-[#d1d5db] text-[14px] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end gap-2 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-[#d1d5db] text-[13px] font-medium text-[#374151] hover:bg-gray-50">Cancel</button>
          <button onClick={() => companyId && changeReqMut.mutate({ company_id: companyId, requested_plan_id: selectedPlanId, reason: reason || undefined })}
            disabled={!selectedPlanId || changeReqMut.isPending}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2">
            {changeReqMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Submit Request
          </button>
        </div>
      </div>
    </div>
  );
}

function UsageBarCard({
  label, current, max, unitPrice, overageCostLabel, onPurchase,
}: {
  label: string; current: number; max: number; unitPrice: number; overageCostLabel?: string; onPurchase: () => void;
}) {
  const pct = Math.min(100, (current / Math.max(max, 1)) * 100);
  const isOver = current > max;
  const overage = Math.max(0, current - max);
  const remaining = Math.max(0, max - current);

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[#0f172a]">{label}</h3>
        {unitPrice > 0 && (
          <button onClick={onPurchase}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold transition-colors">
            <ShoppingBag className="w-3 h-3" /> Buy More
          </button>
        )}
      </div>
      <div className="flex items-end justify-between mb-2">
        <span className="text-[28px] font-mono font-bold text-[#0f172a]">
          {current} <span className="text-[18px] text-[#94a3b8]">/ {max}</span>
        </span>
        <span className={cn("text-sm font-semibold", isOver ? "text-red-600" : "text-green-600")}>
          {isOver ? `${overage} over limit` : `${remaining} remaining`}
        </span>
      </div>
      <div className="h-2 bg-[#e2e8f0] rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", isOver ? "bg-red-500" : "bg-blue-500")}
          style={{ width: pct + "%" }} />
      </div>
      {isOver && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          You have exceeded your {label.toLowerCase()} limit by {overage}. {overageCostLabel && `Purchase more at ${overageCostLabel}.`}
        </div>
      )}
    </div>
  );
}

function MillOwnerBillingView() {
  const qc = useQueryClient();
  const { setActiveMill, setUser, user } = useAuth();
  const { data: sub, refetch: refetchSub } = useMillSubscription();
  const updateCurrencyMut = useUpdateCurrency();

  // Sync currency symbol to global formatters when subscription loads
  useEffect(() => {
    if (sub?.currency_symbol) setCurrencySymbol(sub.currency_symbol);
  }, [sub?.currency_symbol]);

  const handleCurrencyUpdate = async (symbol: string) => {
    await updateCurrencyMut.mutateAsync(symbol);
    setCurrencySymbol(symbol);
    refetchSub();
  };

  const [addMillOpen, setAddMillOpen] = useState(false);
  const [millForm, setMillForm] = useState({ name: "", code: "", city: "", state: "", phone: "" });
  const [millFormErrors, setMillFormErrors] = useState<Record<string,string>>({});

  const [overageOpen, setOverageOpen] = useState(false);
  const [overageResource, setOverageResource] = useState<"extra_users" | "extra_mills" | "extra_employees">("extra_users");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const addMillMut = useMutation({
    mutationFn: (data: typeof millForm) => api.post("/mills", data).then(r => r.data),
    onSuccess: (newMill: any) => {
      toast.success(`Mill "${newMill.name}" added`);
      qc.invalidateQueries({ queryKey: ["billing-my-plan"] });
      const mill: CompanyMill = { id: newMill.id, name: newMill.name, code: newMill.code };
      setUser({ companyMills: [...(user?.companyMills ?? []), mill] });
      setActiveMill(mill);
      setAddMillOpen(false);
      setMillForm({ name: "", code: "", city: "", state: "", phone: "" });
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Failed to add mill"),
  });

  function handleAddMill() {
    const errs: Record<string,string> = {};
    if (!millForm.name.trim()) errs.name = "Mill name is required";
    if (!millForm.code.trim()) errs.code = "Mill code is required";
    else if (millForm.code.trim().length > 6) errs.code = "Max 6 characters";
    setMillFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    addMillMut.mutate({ ...millForm, code: millForm.code.trim().toUpperCase() });
  }

  const planQ = useQuery({
    queryKey: ["billing-my-plan"],
    queryFn: () => api.get("/billing/my-plan").then(r => r.data),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const d = planQ.data;

  function handleDownloadInvoice(invoiceId: string) {
    const token = localStorage.getItem("spinflow-auth");
    if (!token) return;
    const parsed = JSON.parse(token);
    const accessToken = parsed?.state?.accessToken || parsed?.accessToken;
    if (!accessToken) { toast.error("Not authenticated"); return; }
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `/api/v1/billing/invoices/${invoiceId}/download`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.responseType = "blob";
    xhr.onload = () => {
      if (xhr.status === 200) {
        const url = URL.createObjectURL(xhr.response);
        const a = document.createElement("a");
        a.href = url;
        a.download = `invoice-${invoiceId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        toast.error("Failed to download invoice");
      }
    };
    xhr.onerror = () => toast.error("Network error downloading invoice");
    xhr.send();
  }

  if (planQ.isLoading) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8fafc]">
        <PageHeader title="Billing & Plan" subtitle="Your subscription details" />
        <div className="p-6 space-y-4 animate-pulse">
          <div className="h-28 bg-white border border-[#e2e8f0] rounded-lg" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="h-32 bg-white border border-[#e2e8f0] rounded-lg" />
            <div className="h-32 bg-white border border-[#e2e8f0] rounded-lg" />
            <div className="h-32 bg-white border border-[#e2e8f0] rounded-lg" />
          </div>
          <div className="h-48 bg-white border border-[#e2e8f0] rounded-lg" />
          <div className="h-48 bg-white border border-[#e2e8f0] rounded-lg" />
        </div>
      </div>
    );
  }

  if (planQ.isError) {
    return (
      <div className="flex flex-col min-h-full bg-[#f8fafc]">
        <PageHeader title="Billing & Plan" subtitle="Your subscription details" />
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Failed to load plan details.
            <button onClick={() => qc.invalidateQueries({ queryKey: ["billing-my-plan"] })}
              className="ml-auto underline text-red-600 hover:text-red-800">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const overageLabels: Record<string, string> = {
    extra_users: "₹" + (d?.additional_user_cost ?? 0).toLocaleString("en-IN") + "/user/mo",
    extra_mills: "₹" + (d?.additional_mill_cost ?? 0).toLocaleString("en-IN") + "/mill/mo",
    extra_employees: "₹" + (d?.additional_employee_cost ?? 0).toLocaleString("en-IN") + "/emp/mo",
  };

  return (
    <div className="flex flex-col min-h-full bg-[#f8fafc]">
      <PageHeader
        title="Billing & Plan"
        subtitle="Your subscription details and module access"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["billing-my-plan"] })}
        isRefreshing={planQ.isFetching}
      />
      <div className="p-6 space-y-6">

        {/* Plan summary */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-[20px] font-bold text-[#0f172a]">{d?.plan_display ?? d?.plan ?? "Starter"}</h2>
                <PlanBadge plan={d?.plan ?? "starter"} />
                <StatusBadge status={d?.status ?? "active"} />
              </div>
              <p className="text-[13px] text-[#64748b]">{d?.company_name}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setUpgradeOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[12px] font-semibold transition-colors">
                <ArrowUp className="w-3.5 h-3.5" /> Upgrade Plan
              </button>
              <div className="text-right">
                <p className="text-[28px] font-bold font-mono text-[#0f172a]">{fmtLakh(d?.monthly_amount ?? 0)}</p>
                <p className="text-[13px] text-[#64748b]">per month</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-6 text-[13px] text-[#64748b]">
            {d?.next_billing_at && (
              <div><span className="font-medium text-[#374151]">Next billing: </span>{fmtDate(d.next_billing_at)}</div>
            )}
            {d?.last_payment_at && (
              <div><span className="font-medium text-[#374151]">Last payment: </span>{fmtDate(d.last_payment_at)}</div>
            )}
            <div><span className="font-medium text-[#374151]">Users: </span>{d?.total_users ?? 0}</div>
            <div><span className="font-medium text-[#374151]">Mills: </span>{d?.current_mills ?? 0}</div>
            <div><span className="font-medium text-[#374151]">Employees: </span>{d?.current_employees ?? 0}</div>
          </div>
        </div>

        {/* Usage bars */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <UsageBarCard
            label="User Licenses"
            current={d?.total_users ?? 0}
            max={d?.max_users ?? 0}
            unitPrice={d?.additional_user_cost ?? 0}
            overageCostLabel={overageLabels.extra_users}
            onPurchase={() => { setOverageResource("extra_users"); setOverageOpen(true); }}
          />
          <UsageBarCard
            label="Mill Licenses"
            current={d?.current_mills ?? 0}
            max={d?.max_mills ?? 0}
            unitPrice={d?.additional_mill_cost ?? 0}
            overageCostLabel={overageLabels.extra_mills}
            onPurchase={() => { setOverageResource("extra_mills"); setOverageOpen(true); }}
          />
          <UsageBarCard
            label="Employee Licenses"
            current={d?.current_employees ?? 0}
            max={d?.max_employees ?? 0}
            unitPrice={d?.additional_employee_cost ?? 0}
            overageCostLabel={overageLabels.extra_employees}
            onPurchase={() => { setOverageResource("extra_employees"); setOverageOpen(true); }}
          />
        </div>

        {/* Modules + Mills */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 bg-white border border-[#e2e8f0] rounded-lg p-5">
            <h3 className="text-sm font-semibold text-[#0f172a] mb-4">Active Modules</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(d?.enabled_modules ?? []).map((mod: any) => {
                const Icon = MODULE_ICONS[mod.name] ?? Package;
                return (
                  <div key={mod.name} className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center",
                    mod.enabled ? "border-green-200 bg-green-50" : "border-[#e2e8f0] bg-gray-50 opacity-60",
                  )}>
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", mod.enabled ? "bg-green-100" : "bg-gray-100")}>
                      <Icon className={cn("w-4 h-4", mod.enabled ? "text-green-600" : "text-[#94a3b8]")} />
                    </div>
                    <span className="text-[12px] font-medium text-[#374151] leading-tight">{mod.label}</span>
                    {mod.enabled ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#94a3b8]">Contact support</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="lg:col-span-2 bg-white border border-[#e2e8f0] rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#0f172a]">Your Mills</h3>
              <button
                onClick={() => setAddMillOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Mill
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {(d?.mills ?? []).map((mill: any) => (
                <div key={mill.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors">
                  <span className="font-mono text-[11px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-semibold">{mill.code}</span>
                  <span className="flex-1 text-[13px] font-medium text-[#374151] truncate">{mill.name}</span>
                  <span className="text-[11px] text-[#94a3b8] flex items-center gap-1 shrink-0">
                    <Users className="w-3 h-3" /> {mill.users_count}
                  </span>
                </div>
              ))}
              {(d?.mills ?? []).length === 0 && (
                <p className="text-[13px] text-[#94a3b8] text-center py-6">No mills yet</p>
              )}
            </div>

            {/* Add Mill Dialog */}
            {addMillOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
                  <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
                    <h2 className="text-[17px] font-bold text-[#0f172a]">Add New Mill</h2>
                    <button onClick={() => { setAddMillOpen(false); setMillFormErrors({}); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 text-lg leading-none">✕</button>
                  </div>
                  <div className="px-6 py-4 space-y-3">
                    {[
                      { key: "name", label: "Mill Name*", placeholder: "e.g. Ambur Spinning Mill 1" },
                      { key: "code", label: "Mill Code*", placeholder: "e.g. AM1 (max 6 chars)" },
                      { key: "city", label: "City", placeholder: "e.g. Ambur" },
                      { key: "state", label: "State", placeholder: "e.g. Tamil Nadu" },
                      { key: "phone", label: "Phone", placeholder: "e.g. 9876543210" },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="block text-[13px] font-semibold text-[#374151] mb-1">{label}</label>
                        <input
                          value={(millForm as any)[key]}
                          onChange={e => setMillForm(prev => ({ ...prev, [key]: key === "code" ? e.target.value.toUpperCase() : e.target.value }))}
                          placeholder={placeholder}
                          maxLength={key === "code" ? 6 : 200}
                          className="w-full h-10 px-3 rounded-lg border border-[#d1d5db] text-[14px] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                        {millFormErrors[key] && <p className="text-[12px] text-red-600 mt-1">{millFormErrors[key]}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="px-6 py-4 border-t border-[#e2e8f0] flex justify-end gap-2">
                    <button onClick={() => { setAddMillOpen(false); setMillFormErrors({}); }}
                      className="px-4 py-2 rounded-lg border border-[#d1d5db] text-[13px] font-medium text-[#374151] hover:bg-gray-50">Cancel</button>
                    <button onClick={handleAddMill} disabled={addMillMut.isPending}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2">
                      {addMillMut.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Add Mill
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment history */}
        {(d?.invoices ?? []).length > 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e2e8f0]">
              <h3 className="text-sm font-semibold text-[#0f172a]">Payment History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f1f5f9] border-b border-[#e2e8f0]">
                    {["Month","Amount","Status","Paid On","Invoice"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-[#475569] font-semibold text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#0f172a] whitespace-nowrap">{inv.month}</td>
                      <td className="px-4 py-3 font-mono text-[#0f172a] whitespace-nowrap">{fmtLakh(inv.amount)}</td>
                      <td className="px-4 py-3"><StatusBadge status={inv.status} size="sm" /></td>
                      <td className="px-4 py-3 text-[#64748b] whitespace-nowrap">{inv.paid_at ? fmtDate(inv.paid_at) : "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDownloadInvoice(inv.id)}
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-800 transition-colors">
                          <Download className="w-3.5 h-3.5 shrink-0" /> PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Currency Selector */}
        <div className="bg-white border border-[#e2e8f0] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-[#0f172a] mb-1">Display Currency</h3>
          <p className="text-xs text-[#64748b] mb-4">Changes the currency symbol shown throughout the ERP. Values are not converted.</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {CURRENCIES.map(c => (
              <button key={c.code} onClick={() => handleCurrencyUpdate(c.symbol)}
                disabled={updateCurrencyMut.isPending}
                className={"p-3 rounded-lg border text-center transition-all disabled:opacity-50 " +
                  (sub?.currency_symbol === c.symbol
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-[#e2e8f0] hover:border-blue-300 text-[#374151]")}>
                <span className="text-xl block">{c.symbol}</span>
                <span className="text-[10px] text-[#94a3b8] mt-0.5 block">{c.code}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Dialogs */}
      <OveragePurchaseDialog
        open={overageOpen}
        onClose={() => setOverageOpen(false)}
        planData={{ ...d, resourceType: overageResource }}
      />
      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        currentPlanId={d?.plan_id}
        companyName={d?.company_name}
      />
    </div>
  );
}

export function BillingPortal() {
  const { user } = useAuth();
  const role = user?.role ?? "";
  return (
    <ErrorBoundary>
      {role === "SUPER_ADMIN" ? <SuperAdminBillingView /> : <MillOwnerBillingView />}
    </ErrorBoundary>
  );
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import { Building2, Users, Package, ArrowUpDown } from "lucide-react";

interface SubscriptionStatus {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  mill_count: number;
  mill_limit: number;
  user_count: number;
  user_limit: number;
  mills_exceeded: boolean;
  users_exceeded: boolean;
  cost: {
    plan_monthly: number;
    plan_yearly: number;
    included_modules: string[];
    addon_modules: Array<{ module_name: string; monthly_price: number; yearly_price: number }>;
    addon_module_cost_monthly: number;
    addon_module_cost_yearly: number;
    extra_mills: number;
    extra_users: number;
    extra_mill_cost_monthly: number;
    extra_user_cost_monthly: number;
    total_monthly: number;
    total_yearly: number;
    mill_count: number;
    user_count: number;
  };
}

interface Plan {
  id: string;
  code: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  included_mills: number;
  included_users: number;
  additional_mill_cost: number;
  additional_user_cost: number;
  module_prices: Array<{
    module_name: string;
    monthly_price: number;
    yearly_price: number;
    is_included: boolean;
  }>;
}

const MODULE_LABELS: Record<string, string> = {
  production: "Production",
  quality: "Quality",
  inventory: "Inventory",
  dispatch: "Dispatch",
  purchase: "Purchase",
  stores: "Stores",
  hr: "HR",
  accounts: "Accounts",
  maintenance: "Maintenance",
  payroll: "Payroll",
  sales: "Sales",
  lotrac: "LoTrac",
  reports: "Reports",
};

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function UsageBar({ current, limit, label }: { current: number; limit: number; label: string }) {
  const pct = limit > 0 ? Math.round((current / limit) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {current} / {limit}
        </span>
      </div>
      <Progress value={Math.min(pct, 100)} className="h-2" />
      {pct >= 80 && (
        <p className="text-xs text-amber-600 font-medium">
          {pct >= 100 ? "Limit reached" : `${100 - pct}% remaining`}
        </p>
      )}
    </div>
  );
}

function UpgradeDialog({
  companyId,
  currentPlanId,
  onClose,
}: {
  companyId: string;
  currentPlanId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState(currentPlanId);
  const [billingCycle, setBillingCycle] = useState("monthly");

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ["subscription-plans"],
    queryFn: async () => (await api.get("/subscription/plans")).data,
  });

  const upgrade = useMutation({
    mutationFn: async () => {
      await api.post(`/subscription/companies/${companyId}/plan`, {
        plan_id: selectedPlanId,
        billing_cycle: billingCycle,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-subscription"] });
      toast.success("Plan upgraded");
      onClose();
    },
    onError: () => toast.error("Failed to upgrade plan"),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Change Plan</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">New Plan</label>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatINR(p.monthly_price)}/mo
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Billing Cycle</label>
          <Select value={billingCycle} onValueChange={setBillingCycle}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly (save ~17%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => upgrade.mutate()} disabled={upgrade.isPending}>
          Upgrade
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CompanySubscriptionPanel({ companyId }: { companyId: string }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const { data: sub, isLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["company-subscription", companyId],
    queryFn: async () => (await api.get(`/subscription/companies/${companyId}`)).data,
    enabled: !!companyId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-48 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!sub) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground py-12">
          <Package className="size-12 mx-auto mb-3 opacity-50" />
          <p>No active subscription</p>
          <p className="text-sm mt-1">Assign a plan to get started</p>
        </CardContent>
      </Card>
    );
  }

  const statusColors: Record<string, string> = {
    active: "text-green-600 bg-green-50",
    trial: "text-blue-600 bg-blue-50",
    past_due: "text-amber-600 bg-amber-50",
    expired: "text-red-600 bg-red-50",
    suspended: "text-gray-600 bg-gray-50",
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">{sub.plan_name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[sub.status] ?? "text-gray-600 bg-gray-50"}`}
                >
                  {sub.status.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </span>
                <span className="text-xs text-muted-foreground">{sub.billing_cycle} billing</span>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setUpgradeOpen(true)}>
              <ArrowUpDown className="size-4 mr-1" /> Change Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="size-5 text-muted-foreground" />
              <h4 className="font-medium text-sm">Mill Usage</h4>
            </div>
            <UsageBar current={sub.mill_count} limit={sub.mill_limit} label="Mills" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              <h4 className="font-medium text-sm">User Usage</h4>
            </div>
            <UsageBar current={sub.user_count} limit={sub.user_limit} label="Users" />
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Plan ({sub.billing_cycle})</span>
              <span>{formatINR(sub.cost.plan_monthly)}</span>
            </div>
            {sub.cost.extra_mills > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  Extra Mills ({sub.cost.extra_mills} ×{" "}
                  {formatINR(sub.cost.extra_mill_cost_monthly / Math.max(sub.cost.extra_mills, 1))})
                </span>
                <span>{formatINR(sub.cost.extra_mill_cost_monthly)}</span>
              </div>
            )}
            {sub.cost.addon_module_cost_monthly > 0 && (
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Add-on Modules</span>
                <span>{formatINR(sub.cost.addon_module_cost_monthly)}</span>
              </div>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex justify-between font-semibold">
                <span>Total ({sub.billing_cycle})</span>
                <span>
                  {formatINR(
                    sub.billing_cycle === "yearly" ? sub.cost.total_yearly : sub.cost.total_monthly,
                  )}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modules */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modules</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {sub.cost.included_modules.map((m) => (
              <div key={m} className="flex items-center gap-2 text-sm">
                <div className="size-2 rounded-full bg-green-500" />
                <span>{MODULE_LABELS[m] ?? m}</span>
              </div>
            ))}
            {sub.cost.addon_modules.map((m) => (
              <div key={m.module_name} className="flex items-center gap-2 text-sm">
                <div className="size-2 rounded-full bg-blue-500" />
                <span>{MODULE_LABELS[m.module_name] ?? m.module_name}</span>
                <span className="text-xs text-muted-foreground">
                  (+{formatINR(m.monthly_price)})
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        {upgradeOpen && (
          <UpgradeDialog
            companyId={companyId}
            currentPlanId={sub.plan_id}
            onClose={() => setUpgradeOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Package } from "lucide-react";

interface ModulePrice {
  module_name: string;
  monthly_price: number;
  yearly_price: number;
  is_included: boolean;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  included_mills: number;
  included_users: number;
  additional_mill_cost: number;
  additional_user_cost: number;
  is_active: boolean;
  sort_order: number;
  module_prices: ModulePrice[];
}

const MODULE_NAMES = [
  "production",
  "quality",
  "inventory",
  "dispatch",
  "purchase",
  "stores",
  "hr",
  "accounts",
  "maintenance",
  "payroll",
  "sales",
  "lotrac",
  "reports",
];

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

function PlanFormDialog({ plan, onClose }: { plan?: Plan | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: plan?.name ?? "",
    code: plan?.code ?? "",
    description: plan?.description ?? "",
    monthly_price: plan?.monthly_price ?? 0,
    yearly_price: plan?.yearly_price ?? 0,
    included_mills: plan?.included_mills ?? 1,
    included_users: plan?.included_users ?? 25,
    additional_mill_cost: plan?.additional_mill_cost ?? 0,
    additional_user_cost: plan?.additional_user_cost ?? 0,
    module_prices: (
      plan?.module_prices ??
      MODULE_NAMES.map((m) => ({
        module_name: m,
        monthly_price: 999,
        yearly_price: 9990,
        is_included: false,
      }))
    ).map((mp) => ({
      module_name: mp.module_name,
      monthly_price: mp.monthly_price,
      yearly_price: mp.yearly_price,
      is_included: mp.is_included,
    })),
  });

  const updateModule = (name: string, field: string, value: any) => {
    setForm((f) => ({
      ...f,
      module_prices: f.module_prices.map((mp) =>
        mp.module_name === name ? { ...mp, [field]: value } : mp,
      ),
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (plan) {
        await api.put(`/subscription/plans/${plan.id}`, form);
      } else {
        await api.post("/subscription/plans", form);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription-plans"] });
      toast.success(plan ? "Plan updated" : "Plan created");
      onClose();
    },
    onError: () => toast.error("Failed to save plan"),
  });

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{plan ? "Edit Plan" : "Create Plan"}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4 py-4">
        <div className="col-span-2">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <Label>Code</Label>
          <Input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            disabled={!!plan}
          />
        </div>
        <div>
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <Label>Monthly Price (₹)</Label>
          <Input
            type="number"
            value={form.monthly_price}
            onChange={(e) => setForm((f) => ({ ...f, monthly_price: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Yearly Price (₹)</Label>
          <Input
            type="number"
            value={form.yearly_price}
            onChange={(e) => setForm((f) => ({ ...f, yearly_price: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Included Mills</Label>
          <Input
            type="number"
            value={form.included_mills}
            onChange={(e) => setForm((f) => ({ ...f, included_mills: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Included Users</Label>
          <Input
            type="number"
            value={form.included_users}
            onChange={(e) => setForm((f) => ({ ...f, included_users: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label>Additional Mill Cost (₹/mo)</Label>
          <Input
            type="number"
            value={form.additional_mill_cost}
            onChange={(e) =>
              setForm((f) => ({ ...f, additional_mill_cost: Number(e.target.value) }))
            }
          />
        </div>
        <div>
          <Label>Additional User Cost (₹/mo)</Label>
          <Input
            type="number"
            value={form.additional_user_cost}
            onChange={(e) =>
              setForm((f) => ({ ...f, additional_user_cost: Number(e.target.value) }))
            }
          />
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <h4 className="font-medium mb-3">Module Pricing</h4>
        <div className="space-y-2">
          {form.module_prices.map((mp) => (
            <div
              key={mp.module_name}
              className="flex items-center justify-between gap-4 py-1.5 border-b last:border-0"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={mp.is_included}
                  onCheckedChange={(v) => updateModule(mp.module_name, "is_included", v)}
                />
                <span className="text-sm font-medium w-24">
                  {MODULE_LABELS[mp.module_name] ?? mp.module_name}
                </span>
              </div>
              {!mp.is_included && (
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">₹</span>
                    <Input
                      type="number"
                      className="w-20 h-8 text-xs"
                      value={mp.monthly_price}
                      onChange={(e) =>
                        updateModule(mp.module_name, "monthly_price", Number(e.target.value))
                      }
                    />
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
              )}
              {mp.is_included && (
                <span className="text-xs text-green-600 font-medium">Included</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {plan ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function PlanManager() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  const { data: plans, isLoading } = useQuery<Plan[]>({
    queryKey: ["subscription-plans"],
    queryFn: async () => (await api.get("/subscription/plans")).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Subscription Plans</h3>
        <Button
          size="sm"
          onClick={() => {
            setEditPlan(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="size-4 mr-1" /> New Plan
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-40 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans?.map((plan) => {
            const included = plan.module_prices?.filter((m) => m.is_included).length ?? 0;
            const addon = plan.module_prices?.filter((m) => !m.is_included).length ?? 0;
            return (
              <Card key={plan.id} className="relative">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-lg">{plan.name}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5">{plan.code}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setEditPlan(plan);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-4 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>Monthly</span>
                      <span className="font-semibold">
                        ₹{plan.monthly_price?.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Yearly</span>
                      <span className="font-semibold">
                        ₹{plan.yearly_price?.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="border-t my-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Included Mills</span>
                      <span>{plan.included_mills}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Included Users</span>
                      <span>{plan.included_users}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Extra Mill Cost</span>
                      <span>₹{plan.additional_mill_cost?.toLocaleString("en-IN")}/mo</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Modules</span>
                      <span>
                        {included} included + {addon} addon
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditPlan(null);
        }}
      >
        {dialogOpen && (
          <PlanFormDialog
            plan={editPlan}
            onClose={() => {
              setDialogOpen(false);
              setEditPlan(null);
            }}
          />
        )}
      </Dialog>
    </div>
  );
}

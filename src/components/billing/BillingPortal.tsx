import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, CreditCard, FileText, TrendingUp, CheckCircle2, XCircle, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface CompanyCost {
  plan_monthly: number;
  plan_yearly: number;
  total_monthly: number;
  total_yearly: number;
  included_modules: string[];
  addon_modules: { module_name: string; monthly_price: number }[];
  addon_module_cost_monthly: number;
  addon_module_cost_yearly: number;
  included_mills: number;
  included_users: number;
  extra_mills: number;
  extra_users: number;
  extra_mill_cost_monthly: number;
  extra_user_cost_monthly: number;
  mill_count: number;
  user_count: number;
}

interface SubscriptionStatus {
  plan_id: string;
  plan_code: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  started_at: string | null;
  expires_at: string | null;
  mill_count: number;
  mill_limit: number;
  user_count: number;
  user_limit: number;
  mills_exceeded: boolean;
  users_exceeded: boolean;
  cost: CompanyCost;
}

interface SubscriptionPlan {
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
  module_prices: { module_name: string; monthly_price: number; yearly_price: number; is_included: boolean }[];
}

interface Invoice {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  billing_period_start: string | null;
  billing_period_end: string | null;
  paid_at: string | null;
  transaction_id: string | null;
  gateway: string | null;
  line_items: Record<string, any> | null;
  created_at: string | null;
}

interface ChangeRequest {
  id: string;
  company_id: string;
  requested_plan_id: string;
  change_type: string;
  reason: string | null;
  status: string;
  review_notes: string | null;
  created_at: string | null;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function statusBadge(status: string) {
  switch (status) {
    case "active": return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="size-3 mr-1" />Active</Badge>;
    case "past_due": return <Badge className="bg-amber-100 text-amber-700 border-amber-200"><AlertTriangle className="size-3 mr-1" />Past Due</Badge>;
    case "expired": return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="size-3 mr-1" />Expired</Badge>;
    case "pending": return <Badge className="bg-blue-100 text-blue-700 border-blue-200"><Clock className="size-3 mr-1" />Pending</Badge>;
    case "approved": return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="size-3 mr-1" />Approved</Badge>;
    case "rejected": return <Badge className="bg-red-100 text-red-700 border-red-200"><XCircle className="size-3 mr-1" />Rejected</Badge>;
    case "paid": return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="size-3 mr-1" />Paid</Badge>;
    default: return <Badge>{status}</Badge>;
  }
}

export function BillingPortal() {
  const user = useAuth((s) => s.user);
  const companyId = user?.companyId;
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const { data: subscription, isLoading: subLoading } = useQuery<SubscriptionStatus>({
    queryKey: ["company-subscription", companyId],
    queryFn: async () => (await api.get(`/subscription/companies/${companyId}`)).data,
    enabled: !!companyId,
    refetchOnMount: true,
  });

  const { data: plans } = useQuery<SubscriptionPlan[]>({
    queryKey: ["subscription-plans"],
    queryFn: async () => (await api.get("/subscription/plans")).data,
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["company-invoices", companyId],
    queryFn: async () => (await api.get(`/subscription/invoices?company_id=${companyId}`)).data,
    enabled: !!companyId,
  });

  const { data: billingHistory } = useQuery<{ invoices: Invoice[]; change_requests: ChangeRequest[] }>({
    queryKey: ["billing-history", companyId],
    queryFn: async () => (await api.get(`/subscription/companies/${companyId}/billing-history`)).data,
    enabled: !!companyId,
  });

  const changeRequestMutation = useMutation({
    mutationFn: async (data: { requested_plan_id: string; change_type: string; reason: string }) =>
      await api.post(`/subscription/change-requests?company_id=${companyId}`, data),
    onSuccess: () => {
      toast.success("Change request submitted for review");
      queryClient.invalidateQueries({ queryKey: ["billing-history", companyId] });
      setSelectedPlanId(null);
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail || "Failed to submit change request"),
  });

  if (subLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing & Subscription</h1>
          <p className="text-muted-foreground">Manage your subscription plan and billing history</p>
        </div>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-5 text-teal-600" />
              <CardTitle className="text-lg">Current Plan</CardTitle>
            </div>
            {subscription && statusBadge(subscription.status)}
          </div>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-xl font-bold">{subscription.plan_name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{subscription.billing_cycle} billing</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-teal-600">{formatINR(subscription.cost.total_monthly)}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                  <p className="text-xs text-muted-foreground">or {formatINR(subscription.cost.total_yearly)}/yr</p>
                </div>
              </div>

              {/* Usage bars */}
              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Mills</span>
                    <span>{subscription.mill_count} / {subscription.mill_limit}</span>
                  </div>
                  <Progress value={Math.min((subscription.mill_count / Math.max(subscription.mill_limit, 1)) * 100, 100)} className={subscription.mills_exceeded ? "bg-red-200 [&>div]:bg-red-500" : ""} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Users</span>
                    <span>{subscription.user_count} / {subscription.user_limit}</span>
                  </div>
                  <Progress value={Math.min((subscription.user_count / Math.max(subscription.user_limit, 1)) * 100, 100)} className={subscription.users_exceeded ? "bg-red-200 [&>div]:bg-red-500" : ""} />
                </div>
              </div>

              {/* Cost breakdown */}
              <div className="border rounded-lg p-3 bg-muted/30 space-y-1 text-sm">
                <div className="flex justify-between"><span>Plan base</span><span>{formatINR(subscription.cost.plan_monthly)}/mo</span></div>
                {subscription.cost.addon_modules.length > 0 && (
                  <div className="flex justify-between"><span>Addon modules ({subscription.cost.addon_modules.length})</span><span>{formatINR(subscription.cost.addon_module_cost_monthly)}/mo</span></div>
                )}
                {subscription.cost.extra_mills > 0 && (
                  <div className="flex justify-between"><span>Extra mills ({subscription.cost.extra_mills})</span><span>{formatINR(subscription.cost.extra_mill_cost_monthly)}/mo</span></div>
                )}
                {subscription.cost.extra_users > 0 && (
                  <div className="flex justify-between"><span>Extra users ({subscription.cost.extra_users})</span><span>{formatINR(subscription.cost.extra_user_cost_monthly)}/mo</span></div>
                )}
                <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Total</span><span>{formatINR(subscription.cost.total_monthly)}/mo</span></div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground py-4 text-center">No active subscription found.</p>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><TrendingUp className="size-4 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="plans"><Building2 className="size-4 mr-1" />Change Plan</TabsTrigger>
          <TabsTrigger value="invoices"><FileText className="size-4 mr-1" />Invoices</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          {subscription && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="text-lg font-bold mt-1">{subscription.status}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Billing Cycle</p>
                  <p className="text-lg font-bold mt-1 capitalize">{subscription.billing_cycle}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Started</p>
                  <p className="text-lg font-bold mt-1">{formatDate(subscription.started_at)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Next Billing</p>
                  <p className="text-lg font-bold mt-1">{formatDate(subscription.expires_at)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Invoices</CardTitle></CardHeader>
            <CardContent>
              {(billingHistory?.invoices?.length ?? 0) === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No invoices yet.</p>
              ) : (
                <div className="space-y-2">
                  {(billingHistory?.invoices ?? []).slice(0, 5).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{inv.invoice_number}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(inv.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatINR(inv.amount)}</span>
                        {statusBadge(inv.status)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pending Change Requests</CardTitle></CardHeader>
            <CardContent>
              {(billingHistory?.change_requests ?? []).filter((cr) => cr.status === "pending").length === 0 ? (
                <p className="text-muted-foreground text-center py-4 text-sm">No pending requests.</p>
              ) : (
                <div className="space-y-2">
                  {(billingHistory?.change_requests ?? []).filter((cr) => cr.status === "pending").map((cr) => (
                    <div key={cr.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium capitalize">{cr.change_type}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(cr.created_at)}</p>
                      </div>
                      {statusBadge(cr.status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="space-y-4 pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {(plans ?? []).filter((p) => p.is_active).map((plan) => {
              const isCurrent = plan.id === subscription?.plan_id;
              return (
                <Card key={plan.id} className={`relative ${isCurrent ? "ring-2 ring-teal-500" : ""}`}>
                  {isCurrent && <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-teal-500">Current</Badge>}
                  <CardHeader>
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-2xl font-bold">{formatINR(plan.monthly_price)}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                      <p className="text-xs text-muted-foreground">or {formatINR(plan.yearly_price)}/yr</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">{plan.included_mills} mill{plan.included_mills > 1 ? "s" : ""} included</p>
                      <p className="text-muted-foreground">{plan.included_users} users included</p>
                      {plan.additional_mill_cost > 0 && <p className="text-muted-foreground">Extra mill: {formatINR(plan.additional_mill_cost)}/mo</p>}
                      {plan.additional_user_cost > 0 && <p className="text-muted-foreground">Extra user: {formatINR(plan.additional_user_cost)}/mo</p>}
                    </div>
                    {!isCurrent && (
                      <Button
                        className="w-full"
                        variant={plan.monthly_price > (subscription?.cost.plan_monthly ?? 0) ? "default" : "outline"}
                        onClick={() => {
                          setSelectedPlanId(plan.id);
                          changeRequestMutation.mutate({
                            requested_plan_id: plan.id,
                            change_type: plan.monthly_price > (subscription?.cost.plan_monthly ?? 0) ? "upgrade" : "downgrade",
                            reason: "",
                          });
                        }}
                        disabled={changeRequestMutation.isPending}
                      >
                        {changeRequestMutation.isPending && selectedPlanId === plan.id ? (
                          <><Loader2 className="size-4 mr-2 animate-spin" /> Submitting...</>
                        ) : (
                          plan.monthly_price > (subscription?.cost.plan_monthly ?? 0) ? "Upgrade" : "Downgrade"
                        )}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice History</CardTitle></CardHeader>
            <CardContent>
              {(invoices ?? []).length === 0 ? (
                <p className="text-muted-foreground text-center py-8 text-sm">No invoices yet. Invoices will appear here after your first billing cycle.</p>
              ) : (
                <div className="space-y-3">
                  {(invoices ?? []).map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between border rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <FileText className="size-8 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{inv.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(inv.created_at)}</p>
                          {inv.billing_period_start && (
                            <p className="text-xs text-muted-foreground">{formatDate(inv.billing_period_start)} – {formatDate(inv.billing_period_end)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{formatINR(inv.amount)}</span>
                        {statusBadge(inv.status)}
                        {inv.gateway && <span className="text-xs text-muted-foreground">{inv.gateway}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

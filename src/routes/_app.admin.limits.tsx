import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Company } from "@/lib/types";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/admin/limits")({
  head: () => ({ meta: [{ title: "User Limits — Admin — SpinFlow ERP" }] }),
  component: LimitsPage,
});

function getPlanTier(maxUsers: number): { label: string; color: string } {
  if (maxUsers <= 10) return { label: "Starter", color: "bg-gray-100 text-gray-600" };
  if (maxUsers <= 50) return { label: "Pro", color: "bg-blue-100 text-blue-700" };
  return { label: "Enterprise", color: "bg-purple-100 text-purple-700" };
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return "bg-red-500";
  if (percentage >= 70) return "bg-amber-500";
  return "bg-emerald-500";
}

function EditLimitDialog({ company, onDone }: { company: Company | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [newLimit, setNewLimit] = useState(company?.max_users ?? 10);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleOpen = (o: boolean) => {
    setOpen(o);
    if (o && company) setNewLimit(company.max_users ?? 10);
  };

  const handleSave = async () => {
    if (!company) return;
    if (newLimit < 1 || newLimit > 500) {
      toast.error("Limit must be between 1 and 500");
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/companies/${company.id}/limits`, { max_users: newLimit });
      toast.success(`Limit updated to ${newLimit} for ${company.name}`);
      qc.invalidateQueries({ queryKey: ["masters", "companies", "all"] });
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
      setOpen(false);
      onDone();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? "Failed to update limit");
    } finally {
      setSaving(false);
    }
  };

  const tier = getPlanTier(newLimit);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="size-3.5 mr-1" /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit User Limit — {company?.name}</DialogTitle>
          <DialogDescription>
            Set the maximum number of users allowed for this company.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Current Limit
            </label>
            <p className="text-lg font-bold mt-1">{company?.max_users ?? 10}</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              New Limit
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={newLimit}
              onChange={(e) => setNewLimit(parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-700"
            />
            <p className="text-xs text-muted-foreground">1–500 users</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Plan tier:</span>
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold",
                tier.color,
              )}
            >
              {tier.label}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LimitsPage() {
  const qc = useQueryClient();
  const [editCompany, setEditCompany] = useState<Company | null>(null);

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });
  const statsQ = useQuery({
    queryKey: ["admin-company-stats"],
    queryFn: () => adminApi.getCompanyStats(),
    staleTime: 30_000,
  });

  const companies = (companiesQ.data ?? []) as Company[];
  const companyStats: any[] = (statsQ.data?.company_stats ?? []) as any[];

  const statsMap = new Map(companyStats.map((s: any) => [s.company_id, s]));
  const activeCompanies = companies.filter((c: any) => c.is_active !== false);
  const totalActiveUsers = companyStats.reduce(
    (a: number, s: any) => a + (s.active_user_count ?? 0),
    0,
  );
  const totalMills = companyStats.reduce((a: number, s: any) => a + (s.mill_count ?? 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">User Limits</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Monitor and adjust user limits across companies
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Companies</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Active Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActiveUsers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Mills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMills}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company User Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorBoundary inline label="Limits">
            <DataTable
              tableId="admin_limits"
              columns={
                [
                  {
                    key: "name",
                    label: "Company Name",
                    render: (c: any) => <span className="font-medium">{c.name}</span>,
                  },
                  {
                    key: "_current_users",
                    label: "Current Users",
                    render: (c: any) => statsMap.get(c.id)?.user_count ?? 0,
                  },
                  { key: "max_users", label: "Max Users", render: (c: any) => c.max_users ?? 10 },
                  {
                    key: "_usage",
                    label: "Usage",
                    render: (c: any) => {
                      const current = statsMap.get(c.id)?.user_count ?? 0;
                      const max = c.max_users ?? 10;
                      const pct = max > 0 ? Math.min(Math.round((current / max) * 100), 100) : 0;
                      return (
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <Progress value={pct} className={cn("h-2", getUsageColor(pct))} />
                          <span
                            className={cn(
                              "text-xs font-semibold whitespace-nowrap min-w-[3ch]",
                              pct >= 90
                                ? "text-red-600"
                                : pct >= 70
                                  ? "text-amber-600"
                                  : "text-emerald-600",
                            )}
                          >
                            {pct}%
                          </span>
                        </div>
                      );
                    },
                  },
                ] satisfies ColDef[]
              }
              data={activeCompanies}
              rowKey={(c: any) => c.id}
              emptyMessage="No companies found."
              actions={(item: any) => (
                <EditLimitDialog
                  company={item}
                  onDone={() => {
                    qc.invalidateQueries({ queryKey: ["masters", "companies", "all"] });
                    qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
                    setEditCompany(null);
                  }}
                />
              )}
            />
          </ErrorBoundary>
        </CardContent>
      </Card>
    </div>
  );
}

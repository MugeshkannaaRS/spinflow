import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi, adminApi } from "@/lib/api-service";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";

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

export const Route = createFileRoute("/_app/admin/modules")({
  head: () => ({ meta: [{ title: "Module Manager — Admin — SpinFlow ERP" }] }),
  component: ModuleManagerPage,
});

function ModuleManagerPage() {
  const qc = useQueryClient();
  const [companyId, setCompanyId] = useState("");
  const [modules, setModules] = useState<Record<string, boolean>>({});

  const companiesQ = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });

  const modulesQ = useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => adminApi.getCompanyModules(companyId),
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => adminApi.updateCompanyModules(companyId, modules),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-modules", companyId] });
      toast.success("Modules updated");
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to save modules");
    },
  });

  function handleCompanyChange(id: string) {
    setCompanyId(id);
    setModules({});
  }

  function handleToggle(mod: string, value: boolean) {
    setModules((prev) => ({ ...prev, [mod]: value }));
  }

  const companies: any[] = (companiesQ.data ?? []) as any[];

  const isDirty = modulesQ.data ? JSON.stringify(modules) !== JSON.stringify(modulesQ.data) : false;

  if (!companyId) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Module Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">Toggle module access per company</p>
        </div>
        <div className="max-w-xs">
          <Select value="" onValueChange={handleCompanyChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a company" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  const selectedModules = modulesQ.data ?? {};

  if (!modulesQ.isFetched) {
    return (
      <div className="p-6 space-y-6">
        <div className="max-w-xs">
          <Select value={companyId} onValueChange={handleCompanyChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="h-48 bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentCompany = companies.find((c: any) => c.id === companyId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Module Manager</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {currentCompany?.name ?? "Unknown company"}
          </p>
        </div>
        <div className="w-64">
          <Select value={companyId} onValueChange={handleCompanyChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Modules — {currentCompany?.name}</CardTitle>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {ALL_MODULES.map((mod) => (
              <div
                key={mod}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"
              >
                <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
                <Switch
                  checked={modules[mod] ?? selectedModules[mod] ?? false}
                  onCheckedChange={(v) => handleToggle(mod, v)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

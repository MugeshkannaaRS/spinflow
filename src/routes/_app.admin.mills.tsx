import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { mastersApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Factory, DatabaseZap, CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import type { Mill } from "@/lib/types";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

export const Route = createFileRoute("/_app/admin/mills")({
  head: () => ({ meta: [{ title: "Mills — Admin — SpinFlow ERP" }] }),
  component: MillsPage,
});

function MillsPage() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);

  const { data: companiesData } = useQuery({
    queryKey: ["masters", "companies", "all"],
    queryFn: () => mastersApi.getCompanies(1, 100, true),
    staleTime: 60_000,
  });

  const { data: millsData, isLoading } = useQuery({
    queryKey: ["masters", "mills"],
    queryFn: () => mastersApi.getMills(),
    staleTime: 60_000,
  });

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <div className="p-6 text-destructive text-lg font-medium">
        Only Super Admin can access this page.
      </div>
    );
  }

  const companies = (Array.isArray(companiesData) ? companiesData : []) as any[];
  const mills = (Array.isArray(millsData) ? millsData : []) as Mill[];

  const columns: ColDef<Mill>[] = [
    {
      key: "name",
      label: "Mill Name",
      render: (m) => <span className="font-medium">{m.name}</span>,
    },
    { key: "code", label: "Code" },
    {
      key: "_company",
      label: "Company",
      render: (m) => {
        const c = companies.find((c: any) => c.id === m.company_id);
        return c?.name ?? "—";
      },
    },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    {
      key: "is_active",
      label: "Status",
      render: (m) => (
        <span
          className={
            m.is_active
              ? "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"
              : "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700"
          }
        >
          {m.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mills</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage mills across all companies
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-1" /> Add Mill
        </Button>
      </div>

      <MigrationPanel />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All Mills ({mills.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ErrorBoundary inline label="Mills">
          <DataTable
            tableId="admin_mills"
            columns={columns}
            data={mills}
            isLoading={isLoading}
            emptyMessage="No mills found."
            exportFilename="admin_mills"
            rowKey={(m) => m.id}
          />
          </ErrorBoundary>
        </CardContent>
      </Card>

      <AddMillDialog open={addOpen} onOpenChange={setAddOpen} companies={companies} />
    </div>
  );
}

// ─── One-time migration runner ───────────────────────────────────────────────
function MigrationPanel() {
  const [results, setResults] = useState<{ step: string; status: string; detail?: string }[]>([]);
  const mutation = useMutation({
    mutationFn: () => api.post("/production/run-migration-040").then((r) => r.data),
    onSuccess: (data) => {
      setResults(data.results ?? []);
      const allOk = (data.results ?? []).every((r: any) => r.status === "ok");
      if (allOk) toast.success("Migration 040 applied successfully!");
      else toast.warning("Migration ran with some issues — check results below.");
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Migration failed"),
  });

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
          <DatabaseZap className="size-4" />
          Database Migrations
        </CardTitle>
        <p className="text-xs text-amber-700 mt-0.5">
          Run pending migrations that require a database schema change.
        </p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-white p-3">
          <div>
            <div className="text-sm font-medium">Migration 040 — Waste Type + Manpower Categories</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Adds <code>waste_type</code> column to waste_entries · Creates <code>manpower_categories</code> table
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-800 hover:bg-amber-100 shrink-0 ml-4"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            <DatabaseZap className="size-3.5 mr-1.5" />
            {mutation.isPending ? "Running…" : "Run Migration"}
          </Button>
        </div>
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {r.status === "ok"
                  ? <CheckCircle2 className="size-3.5 text-green-600 shrink-0 mt-0.5" />
                  : <XCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />}
                <span className={r.status === "ok" ? "text-green-800" : "text-destructive"}>
                  {r.step}: {r.status === "ok" ? "✓" : r.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddMillDialog({
  open,
  onOpenChange,
  companies,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companies: any[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");

  const createMutation = useMutation({
    mutationFn: () =>
      mastersApi.createMill({
        company_id: companyId,
        name: name.trim(),
        code: code.trim(),
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Mill created successfully");
      onOpenChange(false);
      reset();
      qc.invalidateQueries({ queryKey: ["masters", "mills"] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? "Failed to create mill");
    },
  });

  const reset = () => {
    setName("");
    setCode("");
    setCompanyId("");
    setCity("");
    setState("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim() || !companyId) {
      toast.error("Mill name, code, and company are required");
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Mill</DialogTitle>
          <DialogDescription>
            Create a new mill under an existing company.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company">Company</Label>
            <Select value={companyId} onValueChange={setCompanyId} required>
              <SelectTrigger id="company">
                <SelectValue placeholder="Select company..." />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">Mill Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Unit 1"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Mill Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MILL-001"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Coimbatore"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="e.g. Tamil Nadu"
              />
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating…" : "Create Mill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, FlaskConical, AlertTriangle, ArrowDownToLine } from "lucide-react";
import type { QualityTest } from "@/lib/types";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/quality")({
  head: () => ({ meta: [{ title: "Quality — SpinFlow ERP" }] }),
  component: QualityPage,
});

function QualityPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "quality");
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "MILL_OWNER";
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const testsQ = useQuery({
    queryKey: ["quality-tests", millId],
    queryFn: qualityApi.getTests,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const lotsQ = useQuery({
    queryKey: ["lot-approvals", millId],
    queryFn: qualityApi.getApprovals,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const rejQ = useQuery({
    queryKey: ["rejections", millId],
    queryFn: qualityApi.getRejections,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const tests: any[] = testsQ.data ?? [];
  const lots: any[] = lotsQ.data ?? [];
  const rejections: any[] = rejQ.data ?? [];

  const testColConfig = useColumnConfig("quality_tests");
  const lotColConfig = useColumnConfig("quality_approvals");
  const rejColConfig = useColumnConfig("quality_rejections");

  const passRate = tests.length
    ? Math.round((tests.filter((t) => t.status === "pass").length / tests.length) * 100)
    : 0;
  const pendingLots = lots.filter((l) => l.status === "pending").length;
  const totalRejectedKg = rejections.reduce((s, r) => s + (r.quantityKg ?? 0), 0);

  if (!user) return null;

  if (testsQ.isLoading)
    return (
      <>
        <PageHeader title="Quality Control" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (testsQ.isError)
    return (
      <>
        <PageHeader title="Quality Control" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Quality Control"
        subtitle="CSP testing, lot approvals, rejection analysis & lab register"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["quality-tests"] })}
        isRefreshing={testsQ.isFetching}
      />
      <AccessGuard module="quality">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Tests This Week
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <FlaskConical className="size-5 text-primary" />
                  {tests.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Pass Rate</div>
                <div className="text-2xl font-semibold mt-2">{passRate}%</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Pending Approvals
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />
                  {pendingLots}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Rejected Qty
                </div>
                <div className="text-2xl font-semibold mt-2">{totalRejectedKg} kg</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="tests">
            <TabsList>
              <TabsTrigger value="tests">Lab Tests</TabsTrigger>
              <TabsTrigger value="lots">Lot Approvals</TabsTrigger>
              <TabsTrigger value="rejections">Rejections</TabsTrigger>
            </TabsList>

            <TabsContent value="tests">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Quality Test Results</CardTitle>
                  <div className="flex gap-1">
                    {canEdit && <NewTestSlideOver />}
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="quality_tests"
                    columns={[
                      { key: "date", label: testColConfig.getLabel('date'), type: "date" },
                      { key: "type", label: testColConfig.getLabel('type'), type: "status", render: (t: any) => <Badge variant="outline">{t.type}</Badge> },
                      { key: "lot_id", label: testColConfig.getLabel('lot_id'), className: "font-mono text-xs" },
                      { key: "machine_code", label: testColConfig.getLabel('machine_code'), className: "font-mono text-xs" },
                      { key: "sample_ref", label: testColConfig.getLabel('sample_ref') },
                      { key: "result", label: testColConfig.getLabel('result'), render: (t: any) => `${t.result} ${t.unit}` },
                      { key: "standard", label: testColConfig.getLabel('standard'), render: (t: any) => `${t.standard} ${t.unit}` },
                      { key: "status", label: testColConfig.getLabel('status'), type: "status", render: (t: any) => <Badge variant={t.status === "pass" ? "default" : t.status === "fail" ? "destructive" : "secondary"}>{t.status === "pass" && <CheckCircle2 className="size-3 mr-1 inline" />}{t.status}</Badge> },
                      { key: "tested_by", label: testColConfig.getLabel('tested_by') },
                    ] satisfies ColDef[]}
                    data={tests}
                    loading={testsQ.isLoading}
                    rowKey={(t) => t.id}
                    exportFilename="quality_tests"
                    toolbar={
                      canEdit ? <ImportTestsDialog /> : undefined
                    }
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lots">
              <Card>
                <CardHeader><CardTitle className="text-base">Lot Approval Workflow</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="quality_lots"
                    columns={[
                      { key: "lot_no", label: lotColConfig.getLabel('lot_no'), className: "font-mono text-xs" },
                      { key: "department", label: lotColConfig.getLabel('department'), type: "status" },
                      { key: "produced_kg", label: lotColConfig.getLabel('produced_kg') },
                      { key: "csp_result", label: lotColConfig.getLabel('csp_result') },
                      { key: "count_result", label: lotColConfig.getLabel('count_result') },
                      { key: "moisture_result", label: lotColConfig.getLabel('moisture_result'), render: (l: any) => l.moisture_result != null ? `${l.moisture_result}%` : "—" },
                      { key: "strength_result", label: lotColConfig.getLabel('strength_result') },
                      { key: "status", label: lotColConfig.getLabel('status'), type: "status", render: (l: any) => <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status}</Badge> },
                    ] satisfies ColDef[]}
                    data={lots}
                    loading={lotsQ.isLoading}
                    rowKey={(l) => l.id}
                    exportFilename="lot_approvals"
                    actions={(l) => l.status === "pending" && canEdit ? (
                      <div className="flex gap-1"><LotApproveAction lotId={l.id} /><LotRejectAction lotId={l.id} /></div>
                    ) : null}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rejections">
              <Card>
                <CardHeader><CardTitle className="text-base">Rejection Analysis</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="quality_rejections"
                    columns={[
                      { key: "date", label: rejColConfig.getLabel('date'), type: "date" },
                      { key: "lot_id", label: rejColConfig.getLabel('lot_id'), className: "font-mono text-xs" },
                      { key: "category", label: rejColConfig.getLabel('category'), type: "status", render: (r: any) => <Badge variant="destructive">{r.category}</Badge> },
                      { key: "quantity_kg", label: rejColConfig.getLabel('quantity_kg') },
                      { key: "reason", label: rejColConfig.getLabel('reason'), className: "max-w-xs truncate" },
                      { key: "disposition", label: rejColConfig.getLabel('disposition'), type: "status", render: (r: any) => <Badge variant="outline">{r.disposition}</Badge> },
                      { key: "noted_by", label: rejColConfig.getLabel('noted_by') },
                    ] satisfies ColDef[]}
                    data={rejections}
                    loading={rejQ.isLoading}
                    rowKey={(r) => r.id}
                    exportFilename="rejections"
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function ImportTestsDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <ArrowDownToLine className="size-4 mr-1" />
        Import Excel
      </Button>
      <UniversalImportModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tableName="quality_tests"
        endpoint="/quality/tests/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["quality-tests"] })}
        title="Import Test Results"
      />
    </>
  );
}

function NewTestSlideOver() {
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const [open, setOpen] = useState(false);
  const testTypes = ["HVI", "CSP", "Count", "Strength", "Moisture", "Uniformity", "Trash", "Nep"];
  const typeUnits: Record<string, string> = {
    HVI: "mic",
    CSP: "",
    Count: "Ne",
    Strength: "g/tex",
    Moisture: "%",
    Uniformity: "%",
    Trash: "%",
    Nep: "cnt/g",
  };
  const typeStandards: Record<string, number> = {
    HVI: 4.5,
    CSP: 2400,
    Count: 30,
    Strength: 28,
    Moisture: 8.5,
    Uniformity: 82,
    Trash: 2,
    Nep: 80,
  };
  const [form, setForm] = useState({
    lot_id: "",
    date: new Date().toISOString().slice(0, 10),
    type: "HVI",
    result: "",
    standard: "4.5",
    unit: "mic",
    tested_by: "",
  });

  const lotsQ = useQuery({
    queryKey: ["quality-lots-list", millId],
    queryFn: qualityApi.getLots,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const lots: any[] = lotsQ.data ?? [];

  const m = useMutation({
    mutationFn: (data: any) => qualityApi.createTest(data),
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const reqFields = ["lot_id", "date", "type", "result"] as const;
  const allFilled = reqFields.every((f) => {
    const v = form[f];
    return typeof v === "string" && v.trim().length > 0;
  });

  const handleTypeChange = (type: string) => {
    setForm({
      ...form,
      type,
      unit: typeUnits[type] || "",
      standard: String(typeStandards[type] || ""),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.lot_id.trim()) errs.lot_id = "Lot is required";
    if (!form.date.trim()) errs.date = "Date is required";
    if (!form.type.trim()) errs.type = "Type is required";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const payload = {
      date: form.date,
      type: form.type,
      lot_id: form.lot_id,
      result: parseFloat(form.result) || 0,
      standard: parseFloat(form.standard) || 0,
      unit: form.unit || undefined,
      tested_by: form.tested_by || undefined,
    };
    m.mutate(payload, {
      onSuccess: () => {
        toast.success("Test recorded");
        qc.invalidateQueries({ queryKey: ["quality-tests"] });
        setOpen(false);
        setForm({
          lot_id: "",
          date: new Date().toISOString().slice(0, 10),
          type: "HVI",
          result: "",
          standard: "4.5",
          unit: "mic",
          tested_by: "",
        });
        setFormErrors({});
      },
      onError: (err: any) => {
        const detail = err?.response?.data?.detail;
        const msg = Array.isArray(detail) ? detail.map((e: any) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ") : detail || "Failed to record test";
        toast.error(msg);
      },
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New test
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New quality test</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Lot <span className="text-destructive">*</span></Label>
              <Select
                value={form.lot_id}
                onValueChange={(v) => { setForm({ ...form, lot_id: v }); setFormErrors((p) => ({ ...p, lot_id: "" })); }}
              >
                <SelectTrigger className={formErrors.lot_id ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select lot" />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot: any) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lotNo || lot.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.lot_id && <p className="text-xs text-destructive">{formErrors.lot_id}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => { setForm({ ...form, date: e.target.value }); setFormErrors((p) => ({ ...p, date: "" })); }}
                className={formErrors.date ? "border-destructive" : ""}
              />
              {formErrors.date && <p className="text-xs text-destructive">{formErrors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Type <span className="text-destructive">*</span></Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Test type" />
                </SelectTrigger>
                <SelectContent>
                  {testTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Result <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                step="0.01"
                value={form.result}
                onChange={(e) => { setForm({ ...form, result: e.target.value }); setFormErrors((p) => ({ ...p, result: "" })); }}
                placeholder="Measured value"
                className={formErrors.result ? "border-destructive" : ""}
              />
              {formErrors.result && <p className="text-xs text-destructive">{formErrors.result}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Standard</Label>
              <Input
                type="number"
                step="0.01"
                value={form.standard}
                onChange={(e) => setForm({ ...form, standard: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="e.g. mic"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tested By</Label>
              <Input
                value={form.tested_by}
                onChange={(e) => setForm({ ...form, tested_by: e.target.value })}
              />
            </div>
          </div>
          <SheetFooter>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Record test"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function LotApproveAction({ lotId }: { lotId: string }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const m = useMutation({
    mutationFn: () =>
      qualityApi.approveOrReject({ lot_id: lotId, action: "approve", by: user?.name ?? "" }),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-success"
      onClick={() =>
        m.mutate(undefined, {
          onSuccess: () => {
            toast.success("Lot approved");
            qc.invalidateQueries({ queryKey: ["lot-approvals"] });
          },
          onError: () => toast.error("Failed to approve lot"),
        })
      }
      disabled={m.isPending}
    >
      <CheckCircle2 className="size-3 mr-1" />
      Approve
    </Button>
  );
}

function LotRejectAction({ lotId }: { lotId: string }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const m = useMutation({
    mutationFn: (data: any) => qualityApi.approveOrReject(data),
  });

  const handleReject = () => {
    m.mutate(
      { lot_id: lotId, action: "reject", reason, by: user?.name ?? "" },
      {
        onSuccess: () => {
          toast.success("Lot rejected");
          qc.invalidateQueries({ queryKey: ["lot-approvals"] });
          setOpen(false);
          setReason("");
        },
        onError: () => toast.error("Failed to reject lot"),
      },
    );
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setOpen(true)}
      >
        <XCircle className="size-3 mr-1" />
        Reject
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Rejection Reason <span className="text-destructive">*</span></Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter the reason for rejection"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!reason.trim() || m.isPending}
            >
              {m.isPending ? "Rejecting…" : "Reject Lot"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

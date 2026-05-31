import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
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
import { Plus, CheckCircle2, XCircle, FlaskConical, AlertTriangle, Upload } from "lucide-react";
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
  const testsQ = useQuery({
    queryKey: ["quality-tests"],
    queryFn: qualityApi.getTests,
    staleTime: 60_000,
    retry: 1,
  });
  const lotsQ = useQuery({
    queryKey: ["lot-approvals"],
    queryFn: qualityApi.getApprovals,
    staleTime: 60_000,
    retry: 1,
  });
  const rejQ = useQuery({
    queryKey: ["rejections"],
    queryFn: qualityApi.getRejections,
    staleTime: 60_000,
    retry: 1,
  });

  const tests: any[] = testsQ.data ?? [];
  const lots: any[] = lotsQ.data ?? [];
  const rejections: any[] = rejQ.data ?? [];

  const testColConfig = useColumnConfig("quality_tests");
  const lotColConfig = useColumnConfig("quality_approvals");
  const rejColConfig = useColumnConfig("quality_tests");

  const passRate = tests.length
    ? Math.round((tests.filter((t) => t.status === "pass").length / tests.length) * 100)
    : 0;
  const pendingLots = lots.filter((l) => l.status === "pending").length;
  const totalRejectedKg = rejections.reduce((s, r) => s + (r.quantityKg ?? 0), 0);

  if (!user) return null;

  if (testsQ.isLoading)
    return (
      <>
        <Topbar title="Quality Control" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (testsQ.isError)
    return (
      <>
        <Topbar title="Quality Control" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Quality Control"
        subtitle="CSP testing, lot approvals, rejection analysis & lab register"
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
                      { key: "lotId", label: testColConfig.getLabel('lotId'), className: "font-mono text-xs" },
                      { key: "machineCode", label: testColConfig.getLabel('machineCode'), className: "font-mono text-xs" },
                      { key: "sampleRef", label: testColConfig.getLabel('sampleRef') },
                      { key: "result", label: testColConfig.getLabel('result'), render: (t: any) => `${t.result} ${t.unit}` },
                      { key: "standard", label: testColConfig.getLabel('standard'), render: (t: any) => `${t.standard} ${t.unit}` },
                      { key: "status", label: testColConfig.getLabel('status'), type: "status", render: (t: any) => <Badge variant={t.status === "pass" ? "default" : t.status === "fail" ? "destructive" : "secondary"}>{t.status === "pass" && <CheckCircle2 className="size-3 mr-1 inline" />}{t.status}</Badge> },
                      { key: "testedBy", label: testColConfig.getLabel('testedBy') },
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
                      { key: "lotNo", label: lotColConfig.getLabel('lotNo'), className: "font-mono text-xs" },
                      { key: "department", label: lotColConfig.getLabel('department'), type: "status" },
                      { key: "producedKg", label: lotColConfig.getLabel('producedKg') },
                      { key: "cspResult", label: lotColConfig.getLabel('cspResult') },
                      { key: "countResult", label: lotColConfig.getLabel('countResult') },
                      { key: "moistureResult", label: lotColConfig.getLabel('moistureResult'), render: (l: any) => l.moistureResult != null ? `${l.moistureResult}%` : "—" },
                      { key: "strengthResult", label: lotColConfig.getLabel('strengthResult') },
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
                      { key: "lotId", label: rejColConfig.getLabel('lotId'), className: "font-mono text-xs" },
                      { key: "category", label: rejColConfig.getLabel('category'), type: "status", render: (r: any) => <Badge variant="destructive">{r.category}</Badge> },
                      { key: "quantityKg", label: rejColConfig.getLabel('quantityKg') },
                      { key: "reason", label: rejColConfig.getLabel('reason'), className: "max-w-xs truncate" },
                      { key: "disposition", label: rejColConfig.getLabel('disposition'), type: "status", render: (r: any) => <Badge variant="outline">{r.disposition}</Badge> },
                      { key: "notedBy", label: rejColConfig.getLabel('notedBy') },
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
        <Upload className="size-4 mr-1" />
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
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    lotId: "",
    date: new Date().toISOString().slice(0, 10),
    count: "",
    mic: "",
    stapleLength: "",
    strength: "",
    uniformity: "",
    sfi: "",
    trash: "",
    nepCount: "",
    shortFibre: "",
    elongation: "",
    testedBy: "",
    notes: "",
  });

  const lotsQ = useQuery({
    queryKey: ["quality-lots-list"],
    queryFn: qualityApi.getLots,
    staleTime: 60_000,
    retry: 1,
  });
  const lots: any[] = lotsQ.data ?? [];

  const m = useMutation({
    mutationFn: (data: any) => qualityApi.createTest(data),
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const reqFields = ["lotId", "date", "count"] as const;
  const allFilled = reqFields.every((f) => {
    const v = form[f];
    return typeof v === "string" && v.trim().length > 0;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.lotId.trim()) errs.lotId = "Lot ID is required";
    if (!form.date.trim()) errs.date = "Date is required";
    if (!form.count.trim()) errs.count = "Count/Yarn is required";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    m.mutate(form, {
      onSuccess: () => {
        toast.success("Test recorded");
        qc.invalidateQueries({ queryKey: ["quality-tests"] });
        setOpen(false);
        setForm({
          lotId: "",
          date: new Date().toISOString().slice(0, 10),
          count: "",
          mic: "",
          stapleLength: "",
          strength: "",
          uniformity: "",
          sfi: "",
          trash: "",
          nepCount: "",
          shortFibre: "",
          elongation: "",
          testedBy: "",
          notes: "",
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
              <Label>Lot No <span className="text-destructive">*</span></Label>
              <Select
                value={form.lotId}
                onValueChange={(v) => { setForm({ ...form, lotId: v }); setFormErrors((p) => ({ ...p, lotId: "" })); }}
              >
                <SelectTrigger className={formErrors.lotId ? "border-destructive" : ""}>
                  <SelectValue placeholder="Select lot" />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((lot: any) => (
                    <SelectItem key={lot.id} value={lot.lotNo || lot.id}>
                      {lot.lotNo || lot.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.lotId && <p className="text-xs text-destructive">{formErrors.lotId}</p>}
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
              <Label>Count <span className="text-destructive">*</span></Label>
              <Input
                value={form.count}
                onChange={(e) => { setForm({ ...form, count: e.target.value }); setFormErrors((p) => ({ ...p, count: "" })); }}
                placeholder="e.g. 30s"
                className={formErrors.count ? "border-destructive" : ""}
              />
              {formErrors.count && <p className="text-xs text-destructive">{formErrors.count}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>MIC</Label>
              <Input
                type="number"
                step="0.01"
                value={form.mic}
                onChange={(e) => setForm({ ...form, mic: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Staple Length</Label>
              <Input
                type="number"
                step="0.1"
                value={form.stapleLength}
                onChange={(e) => setForm({ ...form, stapleLength: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Strength</Label>
              <Input
                type="number"
                step="0.1"
                value={form.strength}
                onChange={(e) => setForm({ ...form, strength: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Uniformity</Label>
              <Input
                type="number"
                step="0.1"
                value={form.uniformity}
                onChange={(e) => setForm({ ...form, uniformity: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>SFI</Label>
              <Input
                type="number"
                step="0.1"
                value={form.sfi}
                onChange={(e) => setForm({ ...form, sfi: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Trash</Label>
              <Input
                type="number"
                step="0.1"
                value={form.trash}
                onChange={(e) => setForm({ ...form, trash: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nep Count</Label>
              <Input
                type="number"
                step="0.1"
                value={form.nepCount}
                onChange={(e) => setForm({ ...form, nepCount: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Short Fibre %</Label>
              <Input
                type="number"
                step="0.1"
                value={form.shortFibre}
                onChange={(e) => setForm({ ...form, shortFibre: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Elongation</Label>
              <Input
                type="number"
                step="0.1"
                value={form.elongation}
                onChange={(e) => setForm({ ...form, elongation: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tested By</Label>
              <Input
                value={form.testedBy}
                onChange={(e) => setForm({ ...form, testedBy: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
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

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
import { ImportButton } from "@/components/ui/ImportButton";
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
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, CheckCircle2, XCircle, FlaskConical, AlertTriangle } from "lucide-react";
import type { QualityTest } from "@/lib/types";

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
                    {canEdit && <NewTestDialog />}
                  </div>
                </CardHeader>
                <CardContent>
                  <DataTable
                    tableId="quality_tests"
                    columns={[
                      { key: "date", label: "Date", type: "date" },
                      { key: "type", label: "Type", type: "status", render: (t: any) => <Badge variant="outline">{t.type}</Badge> },
                      { key: "lotId", label: "Lot", className: "font-mono text-xs" },
                      { key: "machineCode", label: "Machine", className: "font-mono text-xs" },
                      { key: "sampleRef", label: "Sample" },
                      { key: "result", label: "Result", render: (t: any) => `${t.result} ${t.unit}` },
                      { key: "standard", label: "Standard", render: (t: any) => `${t.standard} ${t.unit}` },
                      { key: "status", label: "Status", type: "status", render: (t: any) => <Badge variant={t.status === "pass" ? "default" : t.status === "fail" ? "destructive" : "secondary"}>{t.status === "pass" && <CheckCircle2 className="size-3 mr-1 inline" />}{t.status}</Badge> },
                      { key: "testedBy", label: "Tested By" },
                    ] satisfies ColDef[]}
                    data={tests}
                    loading={testsQ.isLoading}
                    rowKey={(t) => t.id}
                    exportFilename="quality_tests"
                    toolbar={
                      canEdit ? (
                        <ImportButton
                          label="Import"
                          endpoint="/quality/tests/bulk"
                          templateCols={[
                            { key: "date", label: "Date (DD/MM/YYYY)", required: true, type: "date", candidates: ["date"] },
                            { key: "lot_number", label: "Lot Number", required: true, candidates: ["lot", "lot number", "lot no"] },
                            { key: "count", label: "Count", required: true, candidates: ["count", "yarn count"] },
                            { key: "mic", label: "MIC", type: "number", candidates: ["mic", "micronaire"] },
                            { key: "staple", label: "Staple", type: "number", candidates: ["staple", "staple length"] },
                            { key: "strength", label: "Strength", type: "number", candidates: ["strength", "tenacity"] },
                            { key: "uniformity", label: "Uniformity", type: "number", candidates: ["uniformity", "unf"] },
                            { key: "sfi", label: "SFI", type: "number", candidates: ["sfi", "short fiber"] },
                            { key: "result", label: "Result (pass/fail)", required: true, candidates: ["result", "status"] },
                          ]}
                          exampleRow={{ date: "01/01/2025", lot_number: "LOT001", count: "30s", mic: "4.2", staple: "30", strength: "28", uniformity: "84", sfi: "6", result: "pass" }}
                          onSuccess={() => testsQ.refetch()}
                        />
                      ) : undefined
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
                      { key: "lotNo", label: "Lot No", className: "font-mono text-xs" },
                      { key: "department", label: "Department", type: "status" },
                      { key: "producedKg", label: "Qty (kg)" },
                      { key: "cspResult", label: "CSP" },
                      { key: "countResult", label: "Count" },
                      { key: "moistureResult", label: "Moisture", render: (l: any) => l.moistureResult != null ? `${l.moistureResult}%` : "—" },
                      { key: "strengthResult", label: "Strength" },
                      { key: "status", label: "Status", type: "status", render: (l: any) => <Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{l.status}</Badge> },
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
                      { key: "date", label: "Date", type: "date" },
                      { key: "lotId", label: "Lot", className: "font-mono text-xs" },
                      { key: "category", label: "Category", type: "status", render: (r: any) => <Badge variant="destructive">{r.category}</Badge> },
                      { key: "quantityKg", label: "Qty (kg)" },
                      { key: "reason", label: "Reason", className: "max-w-xs truncate" },
                      { key: "disposition", label: "Disposition", type: "status", render: (r: any) => <Badge variant="outline">{r.disposition}</Badge> },
                      { key: "notedBy", label: "Noted By" },
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

function NewTestDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    type: "CSP" as QualityTest["type"],
    lotId: "",
    machineCode: "",
    sampleRef: "",
    result: 0,
    unit: "",
    standard: 0,
    testedBy: "",
    status: "pending" as QualityTest["status"],
  });

  const reqFields = [
    "date",
    "type",
    "lotId",
    "machineCode",
    "sampleRef",
    "result",
    "unit",
    "standard",
    "testedBy",
  ] as const;
  const allFilled = reqFields.every((f) => {
    const v = form[f];
    if (typeof v === "number") return v > 0;
    return typeof v === "string" && v.trim().length > 0;
  });

  const m = useMutation({
    mutationFn: () => qualityApi.createTest(form),
  });

  const handleCreateTest = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => {
      const v = form[f];
      if (typeof v === "number" ? v <= 0 : !v || (typeof v === "string" && !v.trim())) {
        errors[f] = "This field is required";
      }
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Test recorded");
        qc.invalidateQueries({ queryKey: ["quality-tests"] });
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New test
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>New quality test</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateTest} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, date: "" }));
                }}
                className={requiredErrors.date ? "border-destructive" : ""}
              />
              {requiredErrors.date && (
                <p className="text-sm text-destructive">{requiredErrors.date}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Type <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.type}
                onValueChange={(v) => {
                  setForm({ ...form, type: v as QualityTest["type"] });
                  setRequiredErrors((prev) => ({ ...prev, type: "" }));
                }}
              >
                <SelectTrigger className={requiredErrors.type ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CSP">CSP</SelectItem>
                  <SelectItem value="Count">Count</SelectItem>
                  <SelectItem value="Moisture">Moisture</SelectItem>
                  <SelectItem value="Uster">Uster</SelectItem>
                  <SelectItem value="Strength">Strength</SelectItem>
                </SelectContent>
              </Select>
              {requiredErrors.type && (
                <p className="text-sm text-destructive">{requiredErrors.type}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Lot ID <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.lotId}
                onChange={(e) => {
                  setForm({ ...form, lotId: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, lotId: "" }));
                }}
                className={requiredErrors.lotId ? "border-destructive" : ""}
              />
              {requiredErrors.lotId && (
                <p className="text-sm text-destructive">{requiredErrors.lotId}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Machine code <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.machineCode}
                onChange={(e) => {
                  setForm({ ...form, machineCode: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, machineCode: "" }));
                }}
                className={requiredErrors.machineCode ? "border-destructive" : ""}
              />
              {requiredErrors.machineCode && (
                <p className="text-sm text-destructive">{requiredErrors.machineCode}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Sample ref <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.sampleRef}
                onChange={(e) => {
                  setForm({ ...form, sampleRef: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, sampleRef: "" }));
                }}
                className={requiredErrors.sampleRef ? "border-destructive" : ""}
              />
              {requiredErrors.sampleRef && (
                <p className="text-sm text-destructive">{requiredErrors.sampleRef}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Unit <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.unit}
                onChange={(e) => {
                  setForm({ ...form, unit: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, unit: "" }));
                }}
                className={requiredErrors.unit ? "border-destructive" : ""}
              />
              {requiredErrors.unit && (
                <p className="text-sm text-destructive">{requiredErrors.unit}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Result <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={form.result}
                onChange={(e) => {
                  setForm({ ...form, result: +e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, result: "" }));
                }}
                className={requiredErrors.result ? "border-destructive" : ""}
              />
              {requiredErrors.result && (
                <p className="text-sm text-destructive">{requiredErrors.result}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Standard <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={form.standard}
                onChange={(e) => {
                  setForm({ ...form, standard: +e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, standard: "" }));
                }}
                className={requiredErrors.standard ? "border-destructive" : ""}
              />
              {requiredErrors.standard && (
                <p className="text-sm text-destructive">{requiredErrors.standard}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Tested by <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.testedBy}
                onChange={(e) => {
                  setForm({ ...form, testedBy: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, testedBy: "" }));
                }}
                className={requiredErrors.testedBy ? "border-destructive" : ""}
              />
              {requiredErrors.testedBy && (
                <p className="text-sm text-destructive">{requiredErrors.testedBy}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Record test"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LotApproveAction({ lotId }: { lotId: string }) {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const m = useMutation({
    mutationFn: () =>
      qualityApi.approveOrReject({ id: lotId, action: "approve", by: user?.name ?? "" }),
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
  const m = useMutation({
    mutationFn: () =>
      qualityApi.approveOrReject({ id: lotId, action: "reject", by: user?.name ?? "" }),
  });
  return (
    <Button
      size="sm"
      variant="outline"
      className="text-destructive"
      onClick={() =>
        m.mutate(undefined, {
          onSuccess: () => {
            toast.success("Lot rejected");
            qc.invalidateQueries({ queryKey: ["lot-approvals"] });
          },
          onError: () => toast.error("Failed to reject lot"),
        })
      }
      disabled={m.isPending}
    >
      <XCircle className="size-3 mr-1" />
      Reject
    </Button>
  );
}

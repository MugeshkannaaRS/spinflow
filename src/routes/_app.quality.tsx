import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
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
import { useState, useEffect } from "react";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
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

  const [filteredTests, setFilteredTests] = useState<any[]>([]);
  const [filteredLots, setFilteredLots] = useState<any[]>([]);
  const [filteredRejections, setFilteredRejections] = useState<any[]>([]);

  useEffect(() => {
    setFilteredTests(testsQ.data ?? []);
  }, [testsQ.data]);
  useEffect(() => {
    setFilteredLots(lotsQ.data ?? []);
  }, [lotsQ.data]);
  useEffect(() => {
    setFilteredRejections(rejQ.data ?? []);
  }, [rejQ.data]);

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
                    {isAdmin && <ColumnConfigurator module="quality" tableKey="tests" />}
                    {canEdit && <NewTestDialog />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={tests}
                    onFilter={setFilteredTests}
                    columns={[
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      { key: "type" as const, label: "Type", placeholder: "Filter type..." },
                      { key: "lotId" as const, label: "Lot", placeholder: "Filter lot..." },
                      {
                        key: "machineCode" as const,
                        label: "Machine",
                        placeholder: "Filter machine...",
                      },
                      {
                        key: "sampleRef" as const,
                        label: "Sample",
                        placeholder: "Filter sample...",
                      },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                      {
                        key: "testedBy" as const,
                        label: "Tested By",
                        placeholder: "Filter tester...",
                      },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Machine</TableHead>
                          <TableHead>Sample</TableHead>
                          <TableHead className="text-right">Result</TableHead>
                          <TableHead className="text-right">Standard</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Tested By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTests.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm">{t.date}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t.type}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{t.lotId}</TableCell>
                            <TableCell className="font-mono text-xs">{t.machineCode}</TableCell>
                            <TableCell>{t.sampleRef}</TableCell>
                            <TableCell className="text-right font-medium">
                              {t.result} {t.unit}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {t.standard} {t.unit}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  t.status === "pass"
                                    ? "default"
                                    : t.status === "fail"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {t.status === "pass" && <CheckCircle2 className="size-3 mr-1" />}
                                {t.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{t.testedBy}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lots">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Lot Approval Workflow</CardTitle>
                  {isAdmin && <ColumnConfigurator module="quality" tableKey="approvals" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={lots}
                    onFilter={setFilteredLots}
                    columns={[
                      { key: "lotNo" as const, label: "Lot No", placeholder: "Filter lot..." },
                      {
                        key: "department" as const,
                        label: "Department",
                        placeholder: "Filter dept...",
                      },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lot No</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Qty (kg)</TableHead>
                          <TableHead className="text-right">CSP</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Moisture</TableHead>
                          <TableHead className="text-right">Strength</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLots.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.lotNo}</TableCell>
                            <TableCell>{l.department}</TableCell>
                            <TableCell>{l.producedKg}</TableCell>
                            <TableCell className="text-right">{l.cspResult}</TableCell>
                            <TableCell className="text-right">{l.countResult}</TableCell>
                            <TableCell className="text-right">{l.moistureResult}%</TableCell>
                            <TableCell className="text-right">{l.strengthResult}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  l.status === "approved"
                                    ? "default"
                                    : l.status === "rejected"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {l.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {l.status === "pending" && canEdit && (
                                <div className="flex gap-1">
                                  <LotApproveAction lotId={l.id} />
                                  <LotRejectAction lotId={l.id} />
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rejections">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Rejection Analysis</CardTitle>
                  {isAdmin && <ColumnConfigurator module="quality" tableKey="rejections" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={rejections}
                    onFilter={setFilteredRejections}
                    columns={[
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      { key: "lotId" as const, label: "Lot", placeholder: "Filter lot..." },
                      {
                        key: "category" as const,
                        label: "Category",
                        placeholder: "Filter category...",
                      },
                      { key: "reason" as const, label: "Reason", placeholder: "Filter reason..." },
                      {
                        key: "disposition" as const,
                        label: "Disposition",
                        placeholder: "Filter disposition...",
                      },
                      {
                        key: "notedBy" as const,
                        label: "Noted By",
                        placeholder: "Filter noted by...",
                      },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Qty (kg)</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Disposition</TableHead>
                          <TableHead>Noted By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRejections.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm">{r.date}</TableCell>
                            <TableCell className="font-mono text-xs">{r.lotId}</TableCell>
                            <TableCell>
                              <Badge variant="destructive">{r.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{r.quantityKg}</TableCell>
                            <TableCell className="max-w-xs truncate">{r.reason}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{r.disposition}</Badge>
                            </TableCell>
                            <TableCell>{r.notedBy}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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

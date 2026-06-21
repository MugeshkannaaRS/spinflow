import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  CheckCircle2,
  XCircle,
  FlaskConical,
  AlertTriangle,
  ArrowDown,
  Trash2,
  Pencil,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QualityTest } from "@/lib/types";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

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
  const totalRejectedKg = rejections.reduce((s, r) => s + (r.quantity_kg ?? 0), 0);

  if (!user)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );

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
            <TabsList className="flex-wrap h-auto gap-y-1">
              <TabsTrigger value="tests">Lab Tests</TabsTrigger>
              <TabsTrigger value="lots">Lot Approvals</TabsTrigger>
              <TabsTrigger value="rejections">Rejections</TabsTrigger>
              <TabsTrigger value="carding">Carding / Blowroom</TabsTrigger>
              <TabsTrigger value="drawing">Drawing</TabsTrigger>
              <TabsTrigger value="simplex">Simplex</TabsTrigger>
              <TabsTrigger value="ringframe">Ring Frame</TabsTrigger>
              <TabsTrigger value="autoconer">Auto Coner</TabsTrigger>
              <TabsTrigger value="packing">Packing</TabsTrigger>
            </TabsList>

            <TabsContent value="tests">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Quality Test Results</CardTitle>
                  {canEdit && <NewTestSlideOver />}
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Quality Tests">
                    <DataTable
                      tableId="quality_tests"
                      columns={
                        [
                          { key: "date", label: testColConfig.getLabel("date"), type: "date" },
                          {
                            key: "type",
                            label: testColConfig.getLabel("type"),
                            type: "status",
                            render: (t: any) => <Badge variant="outline">{t.type}</Badge>,
                          },
                          {
                            key: "lot_id",
                            label: testColConfig.getLabel("lot_id"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "machine_code",
                            label: testColConfig.getLabel("machine_code"),
                            className: "font-mono text-xs",
                          },
                          { key: "sample_ref", label: testColConfig.getLabel("sample_ref") },
                          {
                            key: "result",
                            label: testColConfig.getLabel("result"),
                            render: (t: any) => `${t.result} ${t.unit}`,
                          },
                          {
                            key: "standard",
                            label: testColConfig.getLabel("standard"),
                            render: (t: any) => `${t.standard} ${t.unit}`,
                          },
                          {
                            key: "status",
                            label: testColConfig.getLabel("status"),
                            type: "status",
                            render: (t: any) => <StatusBadge status={t.status} size="sm" />,
                          },
                          { key: "tested_by", label: testColConfig.getLabel("tested_by") },
                        ] satisfies ColDef[]
                      }
                      data={tests}
                      loading={testsQ.isLoading}
                      rowKey={(t) => t.id}
                      exportFilename="quality_tests"
                      disableExport={true}
                      toolbar={
                        <div className="flex gap-1">
                          <ExportDateRangeButton
                            onExportXlsx={(f, t) => exportApi.qualityXlsx(f, t)}
                          />
                          {canEdit && <ImportTestsDialog />}
                        </div>
                      }
                      actions={
                        canEdit
                          ? (t: any) =>
                              t.status === "pending" ? (
                                <ConfirmDeleteButton
                                  onConfirm={async () => {
                                    await qualityApi.deleteTest(t.id);
                                    qc.invalidateQueries({ queryKey: ["quality-tests"] });
                                  }}
                                  label={`Cancel quality test for lot ${t.lot_id || "—"}?`}
                                  successMessage="Quality test cancelled"
                                />
                              ) : null
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lots">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lot Approval Workflow</CardTitle>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Lot Approvals">
                    <DataTable
                      tableId="quality_lots"
                      columns={
                        [
                          {
                            key: "lot_no",
                            label: lotColConfig.getLabel("lot_no"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "department",
                            label: lotColConfig.getLabel("department"),
                            type: "status",
                          },
                          { key: "produced_kg", label: lotColConfig.getLabel("produced_kg") },
                          { key: "csp_result", label: lotColConfig.getLabel("csp_result") },
                          { key: "count_result", label: lotColConfig.getLabel("count_result") },
                          {
                            key: "moisture_result",
                            label: lotColConfig.getLabel("moisture_result"),
                            render: (l: any) =>
                              l.moisture_result != null ? `${l.moisture_result}%` : "—",
                          },
                          {
                            key: "strength_result",
                            label: lotColConfig.getLabel("strength_result"),
                          },
                          {
                            key: "status",
                            label: lotColConfig.getLabel("status"),
                            type: "status",
                            render: (l: any) => <StatusBadge status={l.status} size="sm" />,
                          },
                        ] satisfies ColDef[]
                      }
                      data={lots}
                      loading={lotsQ.isLoading}
                      rowKey={(l) => l.id}
                      exportFilename="lot_approvals"
                      actions={(l) =>
                        l.status === "pending" && canEdit ? (
                          <div className="flex gap-1">
                            <LotApproveAction lotId={l.id} />
                            <LotRejectAction lotId={l.id} />
                          </div>
                        ) : null
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="rejections">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Rejection Analysis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Rejection Analysis">
                    <DataTable
                      tableId="quality_rejections"
                      columns={
                        [
                          { key: "date", label: rejColConfig.getLabel("date"), type: "date" },
                          {
                            key: "lot_id",
                            label: rejColConfig.getLabel("lot_id"),
                            className: "font-mono text-xs",
                          },
                          {
                            key: "category",
                            label: rejColConfig.getLabel("category"),
                            type: "status",
                            render: (r: any) => <Badge variant="destructive">{r.category}</Badge>,
                          },
                          { key: "quantity_kg", label: rejColConfig.getLabel("quantity_kg") },
                          {
                            key: "reason",
                            label: rejColConfig.getLabel("reason"),
                            className: "max-w-xs truncate",
                          },
                          {
                            key: "disposition",
                            label: rejColConfig.getLabel("disposition"),
                            type: "status",
                            render: (r: any) => <Badge variant="outline">{r.disposition}</Badge>,
                          },
                          { key: "noted_by", label: rejColConfig.getLabel("noted_by") },
                        ] satisfies ColDef[]
                      }
                      data={rejections}
                      loading={rejQ.isLoading}
                      rowKey={(r) => r.id}
                      exportFilename="rejections"
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>
            {/* ── Department tabs ── */}
            <TabsContent value="carding">
              <div className="space-y-4">
                {/* ── Carding CV% Record (Uster multi-length) ── */}
                <QmFormsTab
                  title="CV% Records (Carding)"
                  endpoint="/quality/v2/carding/cv-record"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Card Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Process/Lot" },
                    { key: "cotton_type", label: "Cotton" },
                    { key: "delivery_speed", label: "Del. Speed (mpm)" },
                    { key: "cv_1m", label: "CV 1m %" },
                    { key: "cv_2m", label: "CV 2m %" },
                    { key: "cv_5m", label: "CV 5m %" },
                    { key: "cv_10m", label: "CV 10m %" },
                    { key: "cv_20m", label: "CV 20m %" },
                    { key: "cv_50m", label: "CV 50m %" },
                    { key: "cv_100m", label: "CV 100m %" },
                    {
                      key: "within_spec",
                      label: "OK?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">NG</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Carding Waste % Study ── */}
                <QmFormsTab
                  title="Carding Waste % Study"
                  endpoint="/quality-forms/waste-study"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Card Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Process/Lot" },
                    { key: "delivery_hank", label: "Delivery Hank" },
                    { key: "licker_in_speed", label: "Licker-in Speed" },
                    { key: "cylinder_speed", label: "Cylinder Speed" },
                    { key: "flats_speed", label: "Flats Speed" },
                    { key: "delivery_speed", label: "Del. Speed (mpm)" },
                    { key: "wing_setting", label: "Wing Setting" },
                    { key: "empty_can_kg", label: "Empty Can (kg)" },
                    { key: "sliver_can_gross_kg", label: "Sliver Can Gross (kg)" },
                    { key: "total_production_kg", label: "Total Production (kg)" },
                    { key: "licker_in2_waste_kg", label: "Licker-in II Waste (kg)" },
                    { key: "licker_in3_waste_kg", label: "Licker-in III Waste (kg)" },
                    { key: "flat_strips_kg", label: "Flat Strips (kg)" },
                    { key: "suction_hood_back_kg", label: "Suction Hood Back (kg)" },
                    { key: "suction_hood_front_kg", label: "Suction Hood Front (kg)" },
                    { key: "total_wastage_pct", label: "Total Wastage %" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Daily Carding Wrapping Report ── */}
                <QmFormsTab
                  title="Daily Carding Wrapping Report"
                  endpoint="/quality-forms/carding-wrapping"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "line_no", label: "Line No" },
                    { key: "time_taken", label: "Time" },
                    { key: "std_hank", label: "Std Hank" },
                    { key: "r1", label: "R1 (g)" },
                    { key: "r2", label: "R2 (g)" },
                    { key: "r3", label: "R3 (g)" },
                    { key: "r4", label: "R4 (g)" },
                    { key: "r5", label: "R5 (g)" },
                    { key: "avg_weight", label: "Avg Weight (g)" },
                    { key: "actual_hank", label: "Actual Hank" },
                    { key: "cv_pct", label: "CV %" },
                    {
                      key: "ok_input",
                      label: "OK/Input",
                      render: (r: any) =>
                        r.ok_input ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">Input</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
            </TabsContent>

            <TabsContent value="drawing">
              <div className="space-y-4">
                {/* ── Drawing CV Record (Uster multi-length) ── */}
                <QmFormsTab
                  title="Drawing CV Records"
                  endpoint="/quality/v2/drawing/cv-record"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "cotton_type", label: "Cotton" },
                    { key: "process", label: "Process (BD/FD)" },
                    { key: "side", label: "Side (L/R)" },
                    { key: "delivery_speed", label: "Del. Speed" },
                    { key: "a_pct", label: "A%" },
                    { key: "cv_pct", label: "CV%" },
                    { key: "mcv_pct", label: "mCV%" },
                    { key: "cv_1m", label: "CV 1m" },
                    { key: "cv_3m", label: "CV 3m" },
                    { key: "cv_5m", label: "CV 5m" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── A% Check (Auto-Leveller Performance) ── */}
                <QmFormsTab
                  title="A% Check (Auto-Leveller)"
                  endpoint="/quality/v2/drawing/a-pct"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "cotton_type", label: "Cotton" },
                    { key: "process", label: "Process" },
                    { key: "feed_hank", label: "Feed Hank" },
                    { key: "delivery_hank", label: "Delivery Hank" },
                    { key: "doubling", label: "Doubling" },
                    { key: "levelling_action_point", label: "Levelling Action Pt" },
                    { key: "levelling_intensity", label: "Levelling Intensity" },
                    { key: "r1", label: "R1" },
                    { key: "r2", label: "R2" },
                    { key: "r3", label: "R3" },
                    { key: "r4", label: "R4" },
                    { key: "r5", label: "R5" },
                    { key: "r6", label: "R6" },
                    { key: "r7", label: "R7" },
                    { key: "r8", label: "R8" },
                    { key: "r9", label: "R9" },
                    { key: "r10", label: "R10" },
                    { key: "avg_hank", label: "Avg Hank" },
                    { key: "a_pct_n_plus", label: "A% N+" },
                    { key: "a_pct_n_minus", label: "A% N-" },
                    {
                      key: "within_spec",
                      label: "Within Spec?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">NG</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Daily Sliver Wrapping Report (Breaker/Finisher Drawing) ── */}
                <QmFormsTab
                  title="Daily Sliver Wrapping Report (BD/FD)"
                  endpoint="/quality-forms/sliver-wrapping"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "process", label: "Process (BD/FD)" },
                    { key: "side", label: "Side (L/R)" },
                    { key: "time_taken", label: "Time" },
                    { key: "std_hank", label: "Std Hank" },
                    { key: "r1", label: "R1 (g)" },
                    { key: "r2", label: "R2 (g)" },
                    { key: "r3", label: "R3 (g)" },
                    { key: "r4", label: "R4 (g)" },
                    { key: "r5", label: "R5 (g)" },
                    { key: "avg_weight", label: "Avg Wt (g)" },
                    { key: "actual_hank", label: "Actual Hank" },
                    { key: "hank_cv_pct", label: "Hank CV%" },
                    {
                      key: "ok_input",
                      label: "OK/Input",
                      render: (r: any) =>
                        r.ok_input ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">Input</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
            </TabsContent>

            <TabsContent value="simplex">
              <div className="space-y-4">
                {/* ── Simplex Hank Test ── */}
                <QmFormsTab
                  title="Simplex Hank Test"
                  endpoint="/quality-forms/simplex-hank"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Simplex No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "cotton_type", label: "Cotton" },
                    { key: "process", label: "Process" },
                    { key: "nominal_hank", label: "Nominal Hank" },
                    { key: "r1", label: "R1 (g)" },
                    { key: "r2", label: "R2 (g)" },
                    { key: "r3", label: "R3 (g)" },
                    { key: "r4", label: "R4 (g)" },
                    { key: "r5", label: "R5 (g)" },
                    { key: "actual_hank", label: "Actual Hank" },
                    { key: "cv_pct", label: "CV%" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Simplex Breakage Study ── */}
                <QmFormsTab
                  title="Simplex Breakage Study"
                  endpoint="/quality/v2/simplex/breakage-study"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Simplex No" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "cotton_type", label: "Cotton" },
                    { key: "process", label: "Process" },
                    { key: "spl_speed", label: "Spl. Speed" },
                    { key: "time_start", label: "Time Start" },
                    { key: "time_end", label: "Time End" },
                    { key: "duration_hrs", label: "Duration (hrs)" },
                    { key: "feed_hank", label: "Feed Hank" },
                    { key: "delivery_hank", label: "Delivery Hank" },
                    { key: "tpi", label: "TPI" },
                    { key: "tm", label: "TM" },
                    { key: "creel_breaks", label: "Creel Breaks" },
                    { key: "top_roller_lapping", label: "Top Roller Lapping" },
                    { key: "bottom_roller_lapping", label: "Bottom Roller Lapping" },
                    { key: "slub_breaks", label: "Slub Breaks" },
                    { key: "multiple_end_breaks", label: "Multiple End Breaks" },
                    { key: "other_breaks", label: "Other Breaks" },
                    { key: "total_breaks", label: "Total Breaks" },
                    { key: "active_spindles", label: "Active Spindles" },
                    { key: "breaks_per_100spl_hrs", label: "Breaks/100 Spl-Hr" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Simplex Stretch % ── */}
                <QmFormsTab
                  title="Simplex Stretch %"
                  endpoint="/quality/v2/simplex/stretch-pct"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Simplex No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "avg_stretch_pct", label: "Avg Stretch %" },
                    {
                      key: "within_spec",
                      label: "Within Spec?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">NG</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
            </TabsContent>

            <TabsContent value="ringframe">
              <div className="space-y-4">
                {/* ── CSP Strength Report ── */}
                <QmFormsTab
                  title="CSP Strength Report"
                  endpoint="/quality-forms/csp-strength"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "ratio", label: "Ratio" },
                    { key: "tm", label: "TM" },
                    { key: "tpi", label: "TPI" },
                    { key: "s1_strength", label: "S1 Str (gf)" },
                    { key: "s1_weight", label: "S1 Wt (g)" },
                    { key: "s1_count", label: "S1 Ne" },
                    { key: "s1_csp", label: "S1 CSP" },
                    { key: "s2_strength", label: "S2 Str" },
                    { key: "s2_weight", label: "S2 Wt" },
                    { key: "s2_count", label: "S2 Ne" },
                    { key: "s2_csp", label: "S2 CSP" },
                    { key: "s3_strength", label: "S3 Str" },
                    { key: "s3_weight", label: "S3 Wt" },
                    { key: "s3_count", label: "S3 Ne" },
                    { key: "s3_csp", label: "S3 CSP" },
                    { key: "s4_strength", label: "S4 Str" },
                    { key: "s4_weight", label: "S4 Wt" },
                    { key: "s4_count", label: "S4 Ne" },
                    { key: "s4_csp", label: "S4 CSP" },
                    { key: "s5_strength", label: "S5 Str" },
                    { key: "s5_weight", label: "S5 Wt" },
                    { key: "s5_count", label: "S5 Ne" },
                    { key: "s5_csp", label: "S5 CSP" },
                    { key: "s6_strength", label: "S6 Str" },
                    { key: "s6_weight", label: "S6 Wt" },
                    { key: "s6_count", label: "S6 Ne" },
                    { key: "s6_csp", label: "S6 CSP" },
                    { key: "s7_strength", label: "S7 Str" },
                    { key: "s7_weight", label: "S7 Wt" },
                    { key: "s7_count", label: "S7 Ne" },
                    { key: "s7_csp", label: "S7 CSP" },
                    { key: "s8_strength", label: "S8 Str" },
                    { key: "s8_weight", label: "S8 Wt" },
                    { key: "s8_count", label: "S8 Ne" },
                    { key: "s8_csp", label: "S8 CSP" },
                    { key: "s9_strength", label: "S9 Str" },
                    { key: "s9_weight", label: "S9 Wt" },
                    { key: "s9_count", label: "S9 Ne" },
                    { key: "s9_csp", label: "S9 CSP" },
                    { key: "s10_strength", label: "S10 Str" },
                    { key: "s10_weight", label: "S10 Wt" },
                    { key: "s10_count", label: "S10 Ne" },
                    { key: "s10_csp", label: "S10 CSP" },
                    { key: "avg_csp", label: "Avg CSP" },
                    { key: "cv_pct", label: "CV%" },
                    { key: "max_csp", label: "Max CSP" },
                    { key: "min_csp", label: "Min CSP" },
                    {
                      key: "within_spec",
                      label: "Within Spec?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">NG</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Ring Frame Breakage Study ── */}
                <QmFormsTab
                  title="RF Spinning Breakage Study"
                  endpoint="/quality/v2/ring-frame/breakage-study"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "ratio", label: "Ratio" },
                    { key: "tm", label: "TM" },
                    { key: "rh", label: "RH (%)" },
                    { key: "duration_hrs", label: "Duration (hrs)" },
                    { key: "total_breaks", label: "Total Breaks" },
                    { key: "breaks_per_1000spl_hr", label: "Breaks/1000 Spl-Hr" },
                    { key: "overall_breakage_pct", label: "Overall Breakage %" },
                    { key: "repeated_2_6", label: "Repeated 2-6" },
                    { key: "above_6", label: "Above 6" },
                    { key: "traveller_fly", label: "Traveller Fly" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Ring Frame Snap Study & Idle Spindle Check ── */}
                <QmFormsTab
                  title="RF Snap Study & Idle Spindle Check"
                  endpoint="/quality/v2/ring-frame/snap-study"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "rf_type", label: "RF Type" },
                    { key: "snap_rhs", label: "Snaps RHS" },
                    { key: "snap_lhs", label: "Snaps LHS" },
                    { key: "snap_total", label: "Total Snaps" },
                    { key: "roving_exhaust_rhs", label: "Roving Exhaust RHS" },
                    { key: "roving_exhaust_lhs", label: "Roving Exhaust LHS" },
                    { key: "idle_spindles_total", label: "Idle Spindles" },
                    { key: "ohtc_status", label: "OHTC Status" },
                    { key: "reasons", label: "Reasons" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
            </TabsContent>

            <TabsContent value="autoconer">
              <div className="space-y-4">
                {/* ── Yarn Faults Report (Uster QQ4 / UQC-2 — EYC Setting & Cuts) ── */}
                <QmFormsTab
                  title="Yarn Faults Report (Uster QQ4)"
                  endpoint="/quality/v2/auto-coner/yarn-faults"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "drum_no", label: "Drum No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "ratio", label: "Mixing Ratio" },
                    { key: "speed", label: "Speed" },
                    { key: "kms", label: "km Tested" },
                    { key: "yf", label: "YF (Total)" },
                    { key: "n_neps", label: "N (Neps)" },
                    { key: "s_short_thick", label: "S (Short Thick)" },
                    { key: "l_long_thick", label: "L (Long Thick)" },
                    { key: "t_thin", label: "T (Thin)" },
                    { key: "x_extreme", label: "X (Extreme)" },
                    { key: "pf_periodic", label: "PF (Periodic)" },
                    { key: "cp", label: "CP+" },
                    { key: "cm", label: "CM-" },
                    { key: "ccp", label: "CCP+" },
                    { key: "ccm", label: "CCM-" },
                    { key: "dp", label: "DP+" },
                    { key: "dm", label: "DM-" },
                    { key: "fl", label: "FL" },
                    { key: "jp", label: "JP+" },
                    { key: "jm", label: "JM-" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Splice Strength Report ── */}
                <QmFormsTab
                  title="Splice Strength Report"
                  endpoint="/quality/v2/auto-coner/splice-strength"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "splice_pct", label: "Splice Strength %" },
                    {
                      key: "within_spec",
                      label: "≥85%?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">Pass</Badge>
                        ) : (
                          <Badge variant="destructive">Fail</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Wax Pickup Study ── */}
                <QmFormsTab
                  title="Wax Pickup Study"
                  endpoint="/quality/v2/auto-coner/wax-pickup"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "machine_type", label: "Machine Type" },
                    { key: "total_wax_consumed", label: "Total Wax Consumed (g)" },
                    { key: "total_production", label: "Total Production (kg)" },
                    { key: "overall_wax_pickup_pct", label: "Wax Pickup %" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Bag Faults Checking (24 cones/bag) ── */}
                <QmFormsTab
                  title="Bag Faults Checking Report"
                  endpoint="/quality/v2/auto-coner/bag-faults"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "cone_tip_colour", label: "Cone Tip Colour" },
                    { key: "bag_gross_weight", label: "Bag Gross Wt (kg)" },
                    { key: "avg_cone_wt", label: "Avg Cone Wt (g)" },
                    { key: "min_cone_wt", label: "Min Cone Wt (g)" },
                    { key: "max_cone_wt", label: "Max Cone Wt (g)" },
                    {
                      key: "fault_cut_yarn",
                      label: "Cut Yarn",
                      render: (r: any) => r.fault_cut_yarn ? <Badge variant="destructive">✗</Badge> : <span className="text-muted-foreground">—</span>,
                    },
                    {
                      key: "fault_out_yarn",
                      label: "Out Yarn",
                      render: (r: any) => r.fault_out_yarn ? <Badge variant="destructive">✗</Badge> : <span className="text-muted-foreground">—</span>,
                    },
                    {
                      key: "fault_without_sticker",
                      label: "No Sticker",
                      render: (r: any) => r.fault_without_sticker ? <Badge variant="destructive">✗</Badge> : <span className="text-muted-foreground">—</span>,
                    },
                    {
                      key: "fault_contamination",
                      label: "Contamination",
                      render: (r: any) => r.fault_contamination ? <Badge variant="destructive">✗</Badge> : <span className="text-muted-foreground">—</span>,
                    },
                    {
                      key: "fault_ribboning",
                      label: "Ribboning",
                      render: (r: any) => r.fault_ribboning ? <Badge variant="destructive">✗</Badge> : <span className="text-muted-foreground">—</span>,
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
            </TabsContent>

            <TabsContent value="packing">
              <div className="space-y-4">
                {/* ── Blend Test (Cotton/Polyester ratio via solubility) ── */}
                <QmFormsTab
                  title="Blend Test Report"
                  endpoint="/quality/v2/packing/blend-test"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "machine_no", label: "Mc No" },
                    { key: "line_no", label: "Line No" },
                    { key: "process", label: "Process" },
                    { key: "nominal_ratio", label: "Nominal Ratio" },
                    { key: "tested_weight", label: "Tested Wt (g)" },
                    { key: "result_1", label: "Result 1" },
                    { key: "result_2", label: "Result 2" },
                    { key: "result_3", label: "Result 3" },
                    { key: "avg_weight", label: "Avg Wt" },
                    { key: "cotton_pct", label: "Cotton %" },
                    { key: "polyester_pct", label: "Polyester %" },
                    {
                      key: "within_spec",
                      label: "Within Spec?",
                      render: (r: any) =>
                        r.within_spec ? (
                          <Badge variant="outline" className="text-green-600">OK</Badge>
                        ) : (
                          <Badge variant="destructive">NG</Badge>
                        ),
                    },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── PWSE Machine Check (Packaging/Weighing) ── */}
                <QmFormsTab
                  title="PWSE Machine Check"
                  endpoint="/quality/v2/packing/pwse-check"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "shift_code", label: "Shift" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Bag Weight Check (Packed cone bags — gross/tare/net per sample) ── */}
                <QmFormsTab
                  title="Bag Weight Checking"
                  endpoint="/quality-forms/bag-weight"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Lot No" },
                    { key: "count_ne", label: "Count Ne" },
                    { key: "cone_tip_type", label: "Cone Tip" },
                    { key: "inspector", label: "Inspector" },
                    { key: "total_samples", label: "No. of Cones" },
                    { key: "target_weight", label: "Target Wt (g)" },
                    { key: "avg_net_weight", label: "Avg Net Wt (g)" },
                    { key: "min_net_weight", label: "Min Wt (g)" },
                    { key: "max_net_weight", label: "Max Wt (g)" },
                    { key: "std_deviation", label: "Std Dev" },
                    { key: "deviation_pct", label: "Dev %" },
                    { key: "underweight_count", label: "Under" },
                    { key: "overweight_count", label: "Over" },
                    { key: "pass_count", label: "Pass" },
                    { key: "pass_pct", label: "Pass %" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />

                {/* ── Paper Cone Check ── */}
                <QmFormsTab
                  title="Paper Cone Check"
                  endpoint="/quality-forms/paper-cone"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "supplier_name", label: "Supplier" },
                    { key: "batch_no", label: "Batch No" },
                    { key: "total_samples", label: "No. of Cones" },
                    { key: "avg_cone_weight", label: "Avg Wt (g)" },
                    { key: "acceptance_pct", label: "Acceptance %" },
                    { key: "rejection_pct", label: "Rejection %" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  canEdit={canEdit}
                />
              </div>
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
        <ArrowDown className="size-4 mr-1" />
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
        const msg = Array.isArray(detail)
          ? detail.map((e: any) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ")
          : detail || "Failed to record test";
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
              <Label>
                Lot <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.lot_id}
                onValueChange={(v) => {
                  setForm({ ...form, lot_id: v });
                  setFormErrors((p) => ({ ...p, lot_id: "" }));
                }}
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
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => {
                  setForm({ ...form, date: e.target.value });
                  setFormErrors((p) => ({ ...p, date: "" }));
                }}
                className={formErrors.date ? "border-destructive" : ""}
              />
              {formErrors.date && <p className="text-xs text-destructive">{formErrors.date}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>
                Type <span className="text-destructive">*</span>
              </Label>
              <Select value={form.type} onValueChange={handleTypeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Test type" />
                </SelectTrigger>
                <SelectContent>
                  {testTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                  setForm({ ...form, result: e.target.value });
                  setFormErrors((p) => ({ ...p, result: "" }));
                }}
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

// ---------------------------------------------------------------------------
// Generic department tab — fetches from /quality/v2/<endpoint>
// Full CRUD: + New record, Edit (Sheet), Delete (ConfirmDeleteButton)
// ---------------------------------------------------------------------------

type QmFieldType = "text" | "number" | "date" | "shift" | "status" | "yn";

interface QmFieldDef {
  key: string;
  label: string;
  type: QmFieldType;
  required?: boolean;
  step?: string;
}

const SHIFT_OPTIONS = ["A", "B", "C", "R/A", "R/B", "R/C"];
const STATUS_OPTIONS = ["draft", "approved", "rejected"];

function colToQmField(key: string, label: string): QmFieldDef {
  if (key === "date") return { key, label, type: "date", required: true };
  if (key === "shift_code") return { key, label, type: "shift" };
  if (key === "status") return { key, label, type: "status" };
  if (key === "within_spec" || key === "ok_input") return { key, label, type: "yn" };
  if (key === "lot_no") return { key, label, type: "text", required: true };
  if (key === "machine_no" || key === "machine")
    return { key, label, type: "text", required: true };
  // Integer fields — step 1
  const intRe =
    /(_count$|_breaks$|_spindles|drum_no$|doubling$|creel_breaks|roller_lapping|slub_breaks|multiple_end|other_breaks|active_spindles|snap_rhs|snap_lhs|snap_total|roving_exhaust|idle_spindles|traveller_fly|repeated_|above_6|lights_|cone_qty|stock_cone|pass_count|under.*_count|over.*_count|total_samples)/;
  if (intRe.test(key)) return { key, label, type: "number", step: "1" };
  // Numeric fields
  const numericRe =
    /(_pct|_kg|_ne|_csp|kms|_min|_max|_total|_weight|_hank|_speed|_tm|_tpi|_wt|_grams|_hrs|_psi|_bar|_rpm|_1m|_2m|_3m|_5m|_10m|_20m|_50m|_100m|result_|avg_|splice_pct|wax_pickup|_intensity|_action_point|_deviation|overall_|std_deviation)$|^(cv_|avg_|total_|max_|min_|n_neps|s_short|l_long|t_thin|x_extreme|pf_|cp$|cm$|ccp$|ccm$|dp$|dm$|cdp|cdm|fd$|fl$|pp$|jp$|jm$|yf$)/;
  if (numericRe.test(key)) return { key, label, type: "number", step: "0.01" };
  return { key, label, type: "text" };
}

interface QmFormsTabProps {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
}

function QmFormsTab({ title, endpoint, columns, millId, canEdit }: QmFormsTabProps) {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [machineNo, setMachineNo] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any | null>(null);
  const effectiveMillId = millId ?? undefined;
  const today = new Date().toISOString().slice(0, 10);

  // Derive form fields from columns (skip id/mill_id, auto-infer types)
  const formFields = useMemo<QmFieldDef[]>(() => {
    const fields = columns
      .filter((c: any) => !["id", "mill_id"].includes(c.key as string))
      .map((c: any) => colToQmField(c.key as string, c.label as string));
    if (!fields.find((f) => f.key === "remarks")) {
      fields.push({ key: "remarks", label: "Remarks", type: "text" });
    }
    return fields;
  }, [columns]);

  const defaultForm = useMemo(() => {
    const d: Record<string, any> = {};
    formFields.forEach((f) => {
      if (f.key === "date") d[f.key] = today;
      else if (f.key === "status") d[f.key] = "draft";
      else if (f.key === "shift_code") d[f.key] = "A";
      else d[f.key] = "";
    });
    return d;
  }, [formFields, today]);

  const [form, setForm] = useState<Record<string, any>>(defaultForm);

  const openNew = () => {
    setForm(defaultForm);
    setEditRecord(null);
    setSheetOpen(true);
  };
  const openEdit = (record: any) => {
    const f: Record<string, any> = {};
    formFields.forEach((field) => {
      f[field.key] = record[field.key] ?? "";
    });
    setForm(f);
    setEditRecord(record);
    setSheetOpen(true);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["qm-forms", endpoint, effectiveMillId, date, lotNo, machineNo],
    queryFn: async () => {
      const params = new URLSearchParams({ page_size: "100" });
      if (date) params.set("date", date);
      if (lotNo) params.set("lot_no", lotNo);
      if (machineNo) params.set("machine_no", machineNo);
      const res = await api.get(`${endpoint}?${params.toString()}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!effectiveMillId,
    staleTime: 60_000,
    retry: 1,
  });

  const createMut = useMutation({
    mutationFn: (payload: any) => api.post(endpoint, payload),
    onSuccess: () => {
      toast.success("Record saved");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
      setSheetOpen(false);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to save");
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.patch(`${endpoint}/${id}`, payload),
    onSuccess: () => {
      toast.success("Record updated");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
      setSheetOpen(false);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Failed to update");
    },
  });

  const handleSubmit = () => {
    const payload: Record<string, any> = {};
    formFields.forEach((f) => {
      const val = form[f.key];
      if (f.type === "number") {
        payload[f.key] = val === "" || val === undefined ? null : parseFloat(String(val));
      } else if (f.type === "yn") {
        payload[f.key] = val === "true" ? true : val === "false" ? false : null;
      } else {
        payload[f.key] = val === "" ? null : val;
      }
    });
    if (editRecord) {
      updateMut.mutate({ id: editRecord.id, payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <div className="flex flex-wrap gap-2 pt-2">
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-36 text-xs"
              />
              <Input
                placeholder="Lot No"
                value={lotNo}
                onChange={(e) => setLotNo(e.target.value)}
                className="h-8 w-28 text-xs"
              />
              <Input
                placeholder="Machine No"
                value={machineNo}
                onChange={(e) => setMachineNo(e.target.value)}
                className="h-8 w-28 text-xs"
              />
              {(date || lotNo || machineNo) && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setDate("");
                    setLotNo("");
                    setMachineNo("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          {canEdit && (
            <Button size="sm" onClick={openNew} className="mt-1 shrink-0">
              <Plus className="size-3 mr-1" /> New record
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          <DataTable
            tableId={`qm_${endpoint.replace(/\//g, "_")}`}
            columns={columns}
            data={data ?? []}
            loading={isLoading}
            rowKey={(r: any) => r.id}
            exportFilename={title.toLowerCase().replace(/\s+/g, "_")}
            actions={
              canEdit
                ? (r: any) => (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="size-3 mr-1" /> Edit
                      </Button>
                      <ConfirmDeleteButton
                        onConfirm={async () => {
                          await api.delete(`${endpoint}/${r.id}`);
                          qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
                        }}
                        label={`Delete this ${title} record? This cannot be undone.`}
                        successMessage="Record deleted"
                      />
                    </div>
                  )
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editRecord ? `Edit ${title}` : `New ${title}`}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 py-4">
            {formFields.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>
                {f.type === "date" && (
                  <Input
                    type="date"
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
                {f.type === "shift" && (
                  <Select
                    value={form[f.key] ?? "A"}
                    onValueChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SHIFT_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {f.type === "status" && (
                  <Select
                    value={form[f.key] ?? "draft"}
                    onValueChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o.charAt(0).toUpperCase() + o.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {f.type === "yn" && (
                  <Select
                    value={
                      form[f.key] === true || form[f.key] === "true"
                        ? "true"
                        : form[f.key] === false || form[f.key] === "false"
                          ? "false"
                          : ""
                    }
                    onValueChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Yes</SelectItem>
                      <SelectItem value="false">No</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {f.type === "number" && (
                  <Input
                    type="number"
                    step={f.step ?? "0.01"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
                {f.type === "text" && (
                  <Input
                    value={form[f.key] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving…" : editRecord ? "Update" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
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
            <Label>
              Rejection Reason <span className="text-destructive">*</span>
            </Label>
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

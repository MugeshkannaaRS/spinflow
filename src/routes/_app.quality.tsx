import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton, type ShiftOption as ExportShiftOption } from "@/components/ui/ExportDateRangeButton";
import { ExportMenu } from "@/components/ui/ExportMenu";
import { useAuth } from "@/stores/auth";
import { useShifts } from "@/hooks/useMillConfig";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRBAC } from "@/hooks/useRBAC";
import { useLocalDraft, isDraftEmpty } from "@/hooks/useDraft";
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
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  Plus,
  CheckCircle2,
  XCircle,
  FlaskConical,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  FileDown,
  FileText,
  Trash2,
  Pencil,
  Save,
  ChevronDown,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { QualityTest } from "@/lib/types";
import { exportToLetterheadPdf } from "@/lib/export-utils";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomFieldsSection } from "@/components/ui/CustomFieldsSection";

export const Route = createFileRoute("/_app/quality")({
  head: () => ({ meta: [{ title: "Quality — SpinFlow ERP" }] }),
  component: QualityPage,
});

function QualityPage() {
  const user = useAuth((s) => s.user);
  const { canAccess } = useRBAC();
  const canEdit = canAccess("quality", true);
  const qc = useQueryClient();
  const { millId, millName } = useActiveMill();
  const shiftList = useShifts();
  const shiftOptions = shiftList.map((s: any) => ({ id: s.id, name: s.name, code: s.code }));
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
              <TabsTrigger value="calculations">⚙ Calc</TabsTrigger>
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
                            onFetchData={(f, t) => exportApi.qualityJson(f, t)}
                            exportTitle="Quality Lab Tests"
                            shifts={shiftOptions}
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
                  department="carding"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Carding Waste % Study ── */}
                {/* Paper form: header section (date/lot/delivery hank/speeds) at top,
                    then per-machine rows (mc_no, empty can, gross, waste weights, total%) */}
                <QmFormsTab
                  title="Carding Waste % Study"
                  endpoint="/quality/v2/carding/waste-study"
                  department="carding"
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "shift_code", label: "Shift" },
                    { key: "lot_no", label: "Process/Lot" },
                    { key: "delivery_hank", label: "Del. Hank" },
                    { key: "licker_in_speed", label: "Licker-in Spd" },
                    { key: "cylinder_speed", label: "Cylinder Spd" },
                    { key: "flats_speed", label: "Flats Spd" },
                    { key: "delivery_speed", label: "Del. Speed (mpm)" },
                    { key: "wing_setting", label: "Wing Setting" },
                    { key: "machine_no", label: "Card Mc No" },
                    { key: "empty_can_kg", label: "Empty Can (kg)" },
                    { key: "sliver_can_gross_kg", label: "Sliver Gross (kg)" },
                    { key: "total_production_kg", label: "Total Prod (kg)" },
                    { key: "licker_in2_waste_kg", label: "Licker-II (kg)" },
                    { key: "licker_in2_waste_pct", label: "Licker-II %" },
                    { key: "licker_in3_waste_kg", label: "Licker-III (kg)" },
                    { key: "licker_in3_waste_pct", label: "Licker-III %" },
                    { key: "flat_strips_kg", label: "Flat Strips (kg)" },
                    { key: "flat_strips_pct", label: "Flat Strips %" },
                    { key: "suction_hood_back_kg", label: "Suction Back (kg)" },
                    { key: "suction_hood_back_pct", label: "Suction Back %" },
                    { key: "suction_hood_front_kg", label: "Suction Front (kg)" },
                    { key: "suction_hood_front_pct", label: "Suction Front %" },
                    { key: "total_wastage_pct", label: "Total Wastage %" },
                    { key: "remarks", label: "Remarks" },
                    {
                      key: "status",
                      label: "Status",
                      render: (r: any) => <StatusBadge status={r.status} size="sm" />,
                    },
                  ]}
                  millId={millId}
                  millName={millName}
                  canEdit={canEdit}
                  layout="rows"
                />

                {/* ── Daily Carding Wrapping Report ── */}
                <QmFormsTab
                  title="Daily Carding Wrapping Report"
                  endpoint="/quality/v2/carding/wrapping"
                  department="carding"
                  columns={[]}
                  millId={millId}
                  millName={millName}
                  canEdit={canEdit}
                  layout="sheet"
                  hasSide={false}
                  hasProcess={false}
                  hasTime={true}
                  hankField="std_hank"
                  readingLabel="g"
                />
              </div>
            </TabsContent>

            <TabsContent value="drawing">
              <div className="space-y-4">
                {/* ── Drawing CV Record (Uster multi-length) ── */}
                <QmFormsTab
                  title="Drawing CV Records"
                  endpoint="/quality/v2/drawing/cv-record"
                  department="drawing"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── A% Check (Auto-Leveller Performance) ── */}
                <QmFormsTab
                  title="A% Check (Auto-Leveller)"
                  endpoint="/quality/v2/drawing/a-pct"
                  department="drawing"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Daily Sliver Wrapping Report (Breaker/Finisher Drawing) ── */}
                <QmFormsTab
                  title="Daily Sliver Wrapping Report (BD/FD)"
                  endpoint="/quality/v2/drawing/sliver-wrapping"
                  department="drawing"
                  columns={[]}
                  millId={millId}
                  millName={millName}
                  canEdit={canEdit}
                  layout="sheet"
                  hasSide={true}
                  hasProcess={true}
                  hasTime={true}
                  hankField="std_hank"
                  readingLabel="g"
                />
              </div>
            </TabsContent>

            <TabsContent value="simplex">
              <div className="space-y-4">
                {/* ── Simplex Hank Test ── */}
                <QmFormsTab
                  title="Simplex Hank Test"
                  endpoint="/quality/v2/simplex/hank-test"
                  department="simplex"
                  columns={[]}
                  millId={millId}
                  millName={millName}
                  canEdit={canEdit}
                  layout="sheet"
                  hasSide={false}
                  hasProcess={false}
                  hasTime={true}
                  hankField="nominal_hank"
                  readingLabel="g"
                />

                {/* ── Simplex Breakage Study ── */}
                <QmFormsTab
                  title="Simplex Breakage Study"
                  endpoint="/quality/v2/simplex/breakage-study"
                  department="simplex"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="rows"
                />

                {/* ── Simplex Stretch % ── */}
                <QmFormsTab
                  title="Simplex Stretch %"
                  endpoint="/quality/v2/simplex/stretch-pct"
                  department="simplex"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />
              </div>
            </TabsContent>

            <TabsContent value="ringframe">
              <div className="space-y-4">
                {/* ── CSP Strength Report ── */}
                <QmFormsTab
                  title="CSP Strength Report"
                  endpoint="/quality/v2/ring-frame/csp-report"
                  department="ring frame"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Ring Frame Breakage Study ── */}
                <QmFormsTab
                  title="RF Spinning Breakage Study"
                  endpoint="/quality/v2/ring-frame/breakage-study"
                  department="ring frame"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="rows"
                />

                {/* ── Ring Frame Snap Study & Idle Spindle Check ── */}
                <QmFormsTab
                  title="RF Snap Study & Idle Spindle Check"
                  endpoint="/quality/v2/ring-frame/snap-study"
                  department="ring frame"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="rows"
                />
              </div>
            </TabsContent>

            <TabsContent value="autoconer">
              <div className="space-y-4">
                {/* ── Yarn Faults Report (Uster QQ4 / UQC-2 — EYC Setting & Cuts) ── */}
                <QmFormsTab
                  title="Yarn Faults Report (Uster QQ4)"
                  endpoint="/quality/v2/auto-coner/yarn-faults"
                  department="auto coner"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="rows"
                />

                {/* ── Splice Strength Report ── */}
                <QmFormsTab
                  title="Splice Strength Report"
                  endpoint="/quality/v2/auto-coner/splice-strength"
                  department="auto coner"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Wax Pickup Study ── */}
                <QmFormsTab
                  title="Wax Pickup Study"
                  endpoint="/quality/v2/auto-coner/wax-pickup"
                  department="auto coner"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Bag Faults Checking (24 cones/bag) ── */}
                <QmFormsTab
                  title="Bag Faults Checking Report"
                  endpoint="/quality/v2/auto-coner/bag-faults"
                  department="auto coner"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Bag Weight Check (Packed cone bags — gross/tare/net per sample) ── */}
                <QmFormsTab
                  title="Bag Weight Checking"
                  endpoint="/quality/v2/packing/bag-weight"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />

                {/* ── Paper Cone Check ── */}
                <QmFormsTab
                  title="Paper Cone Check"
                  endpoint="/quality/v2/packing/paper-cone"
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
                  millName={millName}
                  canEdit={canEdit}
                  layout="grid"
                />
              </div>
            </TabsContent>
            <TabsContent value="calculations">
              <SpinCalcTab />
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
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" />
        New test
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New quality test</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Record test"}
            </Button>
          </DialogFooter>
        </form>
        </DialogContent>
      </Dialog>
    </>
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
// Quality Module — Table + "Add Record" popup pattern
//
// Each form:  DataTable (saved records, export) + "Add record" button
//             → Dialog with all fields as a proper form
//             → Save → record appears in table
//
// layout prop:
//   "grid"   — plain field-by-field form dialog (most forms)
//   "sheet"  — dialog has page-header section + 5-reading row grid (wrapping/hank)
//   "rows"   — dialog has shared header + per-machine add-rows table (breakage/snap)
// ---------------------------------------------------------------------------

type QmFieldType = "text" | "number" | "date" | "shift" | "status" | "yn";
type QmLayout = "grid" | "sheet" | "rows" | "reading";

interface QmFieldDef {
  key: string;
  label: string;
  type: QmFieldType;
  required?: boolean;
  step?: string;
}

// SHIFT_OPTIONS removed — shift options now come from Masters → Shifts via useShifts()
const STATUS_OPTIONS = ["draft", "approved", "rejected"];

// ── Machine autocomplete ─────────────────────────────────────────────────────
/** Fetch machines for this mill, optionally filtered by department string */
function useMachines(millId: string | null | undefined, department?: string) {
  return useQuery({
    queryKey: ["qm-machines", millId, department ?? "all"],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "500" });
      if (department) p.set("department", department);
      const res = await api.get(`/quality/machines?${p}`);
      const items: any[] = res.data?.data ?? res.data ?? [];
      return items;
    },
    enabled: !!millId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Inline machine-number input with datalist dropdown from uploaded machines */
function MachineComboInput({
  value,
  onChange,
  machines,
  placeholder = "Mc No",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  machines: any[];
  placeholder?: string;
  className?: string;
}) {
  const listId = useMemo(() => `mc-list-${Math.random().toString(36).slice(2)}`, []);
  return (
    <>
      <datalist id={listId}>
        {machines.map((m) => (
          <option key={m.id} value={m.code}>
            {m.code}{m.name ? ` — ${m.name}` : ""}
          </option>
        ))}
      </datalist>
      <input
        list={listId}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={[
          "h-7 text-xs border border-border rounded px-1.5 bg-background",
          "text-foreground focus:outline-none focus:ring-1 focus:ring-primary",
          className,
        ].join(" ")}
      />
    </>
  );
}

// Header fields: always locked at top, not repeated per row
const HEADER_KEYS = new Set(["date", "shift_code", "lot_no"]);

function colToQmField(key: string, label: string): QmFieldDef {
  if (key === "date") return { key, label, type: "date", required: true };
  if (key === "shift_code") return { key, label, type: "shift" };
  if (key === "status") return { key, label, type: "status" };
  if (key === "within_spec" || key === "ok_input") return { key, label, type: "yn" };
  if (key === "lot_no") return { key, label, type: "text", required: true };
  if (key === "machine_no" || key === "machine")
    return { key, label, type: "text", required: true };
  const intRe =
    /(_count$|_breaks$|_spindles|drum_no$|doubling$|creel_breaks|roller_lapping|slub_breaks|multiple_end|other_breaks|active_spindles|snap_rhs|snap_lhs|snap_total|roving_exhaust|idle_spindles|traveller_fly|repeated_|above_6|lights_|cone_qty|stock_cone|pass_count|under.*_count|over.*_count|total_samples)/;
  if (intRe.test(key)) return { key, label, type: "number", step: "1" };
  const numericRe =
    /(_pct|_kg|_ne|_csp|kms|_min|_max|_total|_weight|_hank|_speed|_tm|_tpi|_wt|_grams|_hrs|_psi|_bar|_rpm|_1m|_2m|_3m|_5m|_10m|_20m|_50m|_100m|result_|avg_|splice_pct|wax_pickup|_intensity|_action_point|_deviation|overall_|std_deviation)$|^(cv_|avg_|total_|max_|min_|n_neps|s_short|l_long|t_thin|x_extreme|pf_|cp$|cm$|ccp$|ccm$|dp$|dm$|cdp|cdm|fd$|fl$|pp$|jp$|jm$|yf$)/;
  if (numericRe.test(key)) return { key, label, type: "number", step: "0.01" };
  return { key, label, type: "text" };
}

/** Parse a form value to the right type for the API payload */
function parseVal(val: any, type: QmFieldType) {
  if (type === "number") return val === "" || val == null ? null : parseFloat(String(val));
  if (type === "yn") return val === "true" ? true : val === "false" ? false : null;
  return val === "" ? null : val;
}

/** Avg of numeric values in an array (ignoring nulls) */
function avg(vals: (number | null)[]): number | null {
  const nums = vals.filter((v): v is number => v != null && !isNaN(v));
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/** CV% of numeric array */
function cvPct(vals: (number | null)[]): number | null {
  const a = avg(vals);
  if (a == null || a === 0) return null;
  const nums = vals.filter((v): v is number => v != null && !isNaN(v));
  if (nums.length < 2) return null;
  const variance = nums.reduce((s, v) => s + (v - a) ** 2, 0) / nums.length;
  return (Math.sqrt(variance) / a) * 100;
}

/** Inline cell input — shared between all patterns */
function CellInput({
  value,
  onChange,
  type = "text",
  step,
  placeholder = "—",
  className = "",
  onKeyDown,
  inputRef,
}: {
  value: any;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      type={type}
      step={step}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      className={[
        "h-7 w-full min-w-[48px] max-w-[88px] px-1.5 text-xs",
        "border border-border rounded bg-background text-foreground",
        "focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary",
        "placeholder:text-muted-foreground/50",
        className,
      ].join(" ")}
    />
  );
}

/** Inline cell select for shift/status/yn */
function CellSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 text-xs border border-border rounded bg-background text-foreground px-1 focus:outline-none focus:ring-1 focus:ring-primary min-w-[52px]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QmFormsTab — Table view + "Add Record" popup (matches paper form sketch)
//
// Each quality form:
//   1. Card with title + Export + "Add record" button (top right)
//   2. DataTable of all saved records for the selected date
//   3. "Add record" → Dialog with all fields as a proper labeled form
//   4. Clicking a row → same Dialog pre-filled for editing
//   5. Save/Update → record appears in table
// ═══════════════════════════════════════════════════════════════════════════

interface QmFormsTabProps {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  millName?: string;
  canEdit: boolean;
  layout?: QmLayout;
  department?: string;
  // sheet-specific (wrapping / hank test)
  hasSide?: boolean;
  hasProcess?: boolean;
  hasTime?: boolean;
  hankField?: "std_hank" | "nominal_hank";
  readingLabel?: string;
}

// ── Shared field renderer for dialog forms ──────────────────────────────────
function QmFieldInput({
  field,
  value,
  onChange,
  machines = [],
}: {
  field: QmFieldDef;
  value: any;
  onChange: (v: string) => void;
  machines?: any[];
}) {
  const listId = useMemo(() => `mc-dl-${field.key}-${Math.random().toString(36).slice(2)}`, [field.key]);
  const shiftOptions = useShifts();
  const base =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm " +
    "focus:outline-none focus:ring-1 focus:ring-ring";

  if (field.type === "shift") {
    return (
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={base}>
        {shiftOptions.length === 0 && (
          <option value="" disabled>No shifts — add in Masters</option>
        )}
        {shiftOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    );
  }
  if (field.type === "status") {
    return (
      <select value={value ?? "draft"} onChange={(e) => onChange(e.target.value)} className={base}>
        {STATUS_OPTIONS.map((o) => (
          <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
        ))}
      </select>
    );
  }
  if (field.type === "yn") {
    const cur = value === true || value === "true" ? "true" : value === false || value === "false" ? "false" : "";
    return (
      <select value={cur} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">—</option>
        <option value="true">OK / Yes</option>
        <option value="false">NG / No</option>
      </select>
    );
  }
  // Machine number with autocomplete datalist
  if ((field.key === "machine_no" || field.key === "machine") && machines.length > 0) {
    return (
      <>
        <datalist id={listId}>
          {machines.map((m: any) => (
            <option key={m.id} value={m.code}>{m.code}{m.name ? ` — ${m.name}` : ""}</option>
          ))}
        </datalist>
        <input list={listId} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder="Select or type machine…" className={base} />
      </>
    );
  }
  return (
    <input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      step={field.step}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.label}
      className={base}
    />
  );
}

// ── Live computation helpers ────────────────────────────────────────────────
function computeReadings(form: Record<string, any>, hankField: string) {
  const readings = ["r1","r2","r3","r4","r5"]
    .map((k) => form[k] !== "" && form[k] != null ? parseFloat(form[k]) : null)
    .filter((v): v is number => v != null && !isNaN(v));
  if (readings.length === 0) return { avgWt: null, hank: null, cv: null };
  const avgWt = readings.reduce((a, b) => a + b, 0) / readings.length;
  const stdHankNum = parseFloat(form[hankField]) || null;
  const hank = stdHankNum && avgWt > 0 ? (stdHankNum * 453.59237) / avgWt : null;
  let cv: number | null = null;
  if (readings.length >= 2) {
    const variance = readings.reduce((s, v) => s + (v - avgWt) ** 2, 0) / readings.length;
    cv = (Math.sqrt(variance) / avgWt) * 100;
  }
  return { avgWt, hank, cv };
}

const WASTE_KG_FIELDS = [
  "licker_in2_waste_kg",
  "licker_in3_waste_kg",
  "flat_strips_kg",
  "suction_hood_back_kg",
  "suction_hood_front_kg",
] as const;

const WASTE_PCT_MAP: Record<string, string> = {
  licker_in2_waste_kg:   "licker_in2_waste_pct",
  licker_in3_waste_kg:   "licker_in3_waste_pct",
  flat_strips_kg:        "flat_strips_pct",
  suction_hood_back_kg:  "suction_hood_back_pct",
  suction_hood_front_kg: "suction_hood_front_pct",
};

function computeWaste(form: Record<string, any>) {
  const gross = parseFloat(form.sliver_can_gross_kg) || 0;
  const empty = parseFloat(form.empty_can_kg) || 0;
  const prod = gross > 0 && empty >= 0 ? gross - empty : null;
  if (!prod || prod <= 0) return { prod: null, wastePct: null, indivPct: {} as Record<string, number> };
  const indivPct: Record<string, number> = {};
  let totalWaste = 0;
  for (const kgKey of WASTE_KG_FIELDS) {
    const kg = parseFloat(form[kgKey]) || 0;
    totalWaste += kg;
    const pctKey = WASTE_PCT_MAP[kgKey];
    if (pctKey) indivPct[pctKey] = (kg / prod) * 100;
  }
  return { prod, wastePct: (totalWaste / prod) * 100, indivPct };
}

// ── Grid dialog (most forms) ─────────────────────────────────────────────────
function QmGridDialog({
  open, onClose, title, endpoint, columns, editRecord, millId, department,
}: {
  open: boolean; onClose: () => void; title: string; endpoint: string;
  columns: any[]; editRecord: any | null; millId: string | null | undefined; department?: string;
}) {
  const qc = useQueryClient();
  const { data: machines = [] } = useMachines(millId, department);
  const today = new Date().toISOString().slice(0, 10);

  const formFields = useMemo<QmFieldDef[]>(() => {
    return columns
      .filter((c: any) => !["id","mill_id","company_id","created_at","updated_at"].includes(c.key))
      .map((c: any) => colToQmField(c.key, c.label));
  }, [columns]);

  const makeDefault = useCallback(() => {
    const d: Record<string, any> = {};
    formFields.forEach((f) => {
      if (f.key === "date") d[f.key] = today;
      else if (f.key === "shift_code") d[f.key] = "A";
      else if (f.key === "status") d[f.key] = "draft";
      else d[f.key] = "";
    });
    return d;
  }, [formFields, today]);

  const draftKey = `sf_qm::${endpoint}::${department ?? ""}`;
  const draft = useLocalDraft<Record<string, any>>(draftKey);

  const [form, setForm] = useState<Record<string, any>>(makeDefault);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // Derive DB table name from the endpoint's last path segment (e.g. "/quality/v2/carding/cv-record" → "qm_carding_cv_record")
  const tableName = "qm_" + endpoint.split("/").pop()!.replace(/-/g, "_");

  // Pre-fill when editing; for new records restore draft if present
  useEffect(() => {
    if (editRecord) {
      setCustomFields((editRecord.custom_fields as Record<string, unknown>) ?? {});
      const d: Record<string, any> = {};
      formFields.forEach((f) => { d[f.key] = editRecord[f.key] ?? ""; });
      setForm(d);
    } else {
      const saved = draft.restoreDraft();
      setForm(saved ?? makeDefault());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRecord, open]);

  // Auto-save draft on every change (new records only)
  useEffect(() => {
    if (editRecord) return;
    const isEmpty = isDraftEmpty([form]);
    draft.saveDraft(form, isEmpty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const setField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  // Live computed display
  const { prod, wastePct, indivPct } = useMemo(() => computeWaste(form), [form]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      formFields.forEach((f) => { payload[f.key] = parseVal(form[f.key], f.type); });
      // Inject waste study computed fields
      if (prod != null) {
        payload.total_production_kg = parseFloat(prod.toFixed(3));
        if (wastePct != null) payload.total_wastage_pct = parseFloat(wastePct.toFixed(2));
        // Individual waste percentages
        for (const [k, v] of Object.entries(indivPct)) {
          payload[k] = parseFloat(v.toFixed(2));
        }
      }
      payload.custom_fields = customFields ?? {};
      if (editRecord?.id) {
        await api.patch(`${endpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`${endpoint}`, payload);
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // Computed keys — shown as read-only green tiles, not editable inputs
  const COMPUTED_KEYS = new Set([
    "total_production_kg", "total_wastage_pct", "avg_weight", "actual_hank", "cv_pct",
    "licker_in2_waste_pct", "licker_in3_waste_pct",
    "flat_strips_pct", "suction_hood_back_pct", "suction_hood_front_pct",
  ]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? `Edit — ${title}` : `Add Record — ${title}`}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 py-2">
          {formFields.map((field) => {
            const isComputed = COMPUTED_KEYS.has(field.key);
            let computedDisplay: string | null = null;
            if (field.key === "total_production_kg" && prod != null)
              computedDisplay = prod.toFixed(3) + " kg";
            if (field.key === "total_wastage_pct" && wastePct != null)
              computedDisplay = wastePct.toFixed(2) + "%";
            // Individual waste % — look up from indivPct by matching key
            if (isComputed && indivPct[field.key] != null)
              computedDisplay = indivPct[field.key].toFixed(2) + "%";
            return (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                {isComputed && computedDisplay ? (
                  <div className="flex h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    {computedDisplay} <span className="ml-1 text-[10px] text-muted-foreground">(auto)</span>
                  </div>
                ) : isComputed ? (
                  <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground">
                    — <span className="ml-1 text-[10px]">(auto)</span>
                  </div>
                ) : (
                  <QmFieldInput field={field} value={form[field.key]} onChange={(v) => setField(field.key, v)} machines={machines} />
                )}
              </div>
            );
          })}
        </div>
        <CustomFieldsSection
          tableName={tableName}
          millId={millId}
          values={customFields}
          onChange={(key, value) => setCustomFields((p) => ({ ...p, [key]: value }))}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editRecord ? "Update record" : "Save record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sheet dialog (wrapping / hank test — has readings grid) ─────────────────
function QmSheetDialog({
  open, onClose, title, endpoint, editRecord, millId, department,
  hasSide, hasProcess, hasTime, hankField, readingLabel,
}: {
  open: boolean; onClose: () => void; title: string; endpoint: string;
  editRecord: any | null; millId: string | null | undefined; department?: string;
  hasSide?: boolean; hasProcess?: boolean; hasTime?: boolean;
  hankField: "std_hank" | "nominal_hank"; readingLabel: string;
}) {
  const qc = useQueryClient();
  const { data: machines = [] } = useMachines(millId, department);
  const shiftOptions = useShifts();
  const today = new Date().toISOString().slice(0, 10);
  const listId = useMemo(() => `mc-dl-sheet-${Math.random().toString(36).slice(2)}`, []);

  const makeDefault = () => ({
    date: today, shift_code: "", lot_no: "", process: "",
    [hankField]: "", cotton_type: "",
    machine_no: "", side: "", time_taken: "",
    r1: "", r2: "", r3: "", r4: "", r5: "",
    ok_input: "", remarks: "",
  });

  const sheetDraftKey = `sf_qm::${endpoint}::${department ?? ""}::sheet`;
  const sheetDraft = useLocalDraft<Record<string, any>>(sheetDraftKey);

  const [form, setForm] = useState<Record<string, any>>(makeDefault);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const sheetTableName = "qm_" + endpoint.split("/").pop()!.replace(/-/g, "_");

  useEffect(() => {
    if (editRecord) {
      setCustomFields((editRecord.custom_fields as Record<string, unknown>) ?? {});
      setForm({
        date: editRecord.date ?? today,
        shift_code: editRecord.shift_code ?? "",
        lot_no: editRecord.lot_no ?? "",
        process: editRecord.process ?? "",
        [hankField]: editRecord[hankField] ?? "",
        cotton_type: editRecord.cotton_type ?? "",
        machine_no: editRecord.machine_no ?? "",
        side: editRecord.side ?? "",
        time_taken: editRecord.time_taken ?? "",
        r1: editRecord.r1 ?? "", r2: editRecord.r2 ?? "", r3: editRecord.r3 ?? "",
        r4: editRecord.r4 ?? "", r5: editRecord.r5 ?? "",
        ok_input: editRecord.ok_input === true ? "true" : editRecord.ok_input === false ? "false" : "",
        remarks: editRecord.remarks ?? "",
      });
    } else {
      const saved = sheetDraft.restoreDraft();
      setForm(saved ?? makeDefault());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRecord, open]);

  // Auto-save draft on change (new records only)
  useEffect(() => {
    if (editRecord) return;
    const isEmpty = !Object.values(form).some((v) => v !== "" && v !== null && v !== undefined);
    sheetDraft.saveDraft(form, isEmpty);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const stdHankNum = parseFloat(form[hankField]) || null;
  const { avgWt, hank, cv } = useMemo(() => computeReadings(form, hankField), [form, hankField]);
  const cvOk = cv == null ? null : cv <= 2.0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        date: form.date || null,
        shift_code: form.shift_code || null,
        lot_no: form.lot_no || null,
        [hankField]: stdHankNum,
        cotton_type: form.cotton_type || null,
        machine_no: form.machine_no || null,
        time_taken: form.time_taken || null,
        r1: form.r1 !== "" ? parseFloat(form.r1) : null,
        r2: form.r2 !== "" ? parseFloat(form.r2) : null,
        r3: form.r3 !== "" ? parseFloat(form.r3) : null,
        r4: form.r4 !== "" ? parseFloat(form.r4) : null,
        r5: form.r5 !== "" ? parseFloat(form.r5) : null,
        avg_weight: avgWt != null ? parseFloat(avgWt.toFixed(3)) : null,
        actual_hank: hank != null ? parseFloat(hank.toFixed(4)) : null,
        cv_pct: cv != null ? parseFloat(cv.toFixed(3)) : null,
        ok_input: form.ok_input === "true" ? true : form.ok_input === "false" ? false : null,
        remarks: form.remarks || null,
      };
      if (hasSide) payload.side = form.side || null;
      if (hasProcess) payload.process = form.process || null;
      payload.custom_fields = customFields ?? {};
      if (editRecord?.id) {
        await api.patch(`${endpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`${endpoint}`, payload);
        sheetDraft.discardDraft();
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {editRecord ? `Edit — ${title}` : `Add Record — ${title}`}
            {!editRecord && sheetDraft.hasDraft && (
              <span className="text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                unsaved draft restored
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Header section — shared fields (mirrors top of paper form) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-3 border-b border-border">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={form.date} onChange={(e) => setF("date", e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Shift</label>
            <select value={form.shift_code} onChange={(e) => setF("shift_code", e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              {shiftOptions.length === 0 && <option value="" disabled>No shifts — add in Masters</option>}
              {shiftOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Process / Lot</label>
            <input value={form.lot_no} onChange={(e) => setF("lot_no", e.target.value)}
              placeholder="e.g. CR-80/20"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          {hasProcess && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Process (BD/FD)</label>
              <select value={form.process ?? ""} onChange={(e) => setF("process", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">—</option>
                <option value="BD">BD</option>
                <option value="FD">FD</option>
              </select>
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              {hankField === "nominal_hank" ? "Nominal Hank" : "Std Hank"}
            </label>
            <input type="number" step="0.0001" value={form[hankField] ?? ""}
              onChange={(e) => setF(hankField, e.target.value)} placeholder="0.1000"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            {stdHankNum && (
              <p className="text-[10px] text-muted-foreground">
                Range: {(stdHankNum * 0.995).toFixed(4)} – {(stdHankNum * 1.005).toFixed(4)}
              </p>
            )}
          </div>
        </div>

        {/* Per-machine fields + readings */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Machine No</label>
            {machines.length > 0 ? (
              <>
                <datalist id={listId}>
                  {machines.map((m: any) => (
                    <option key={m.id} value={m.code}>{m.code}{m.name ? ` — ${m.name}` : ""}</option>
                  ))}
                </datalist>
                <input list={listId} value={form.machine_no} onChange={(e) => setF("machine_no", e.target.value)}
                  placeholder="Select machine…"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </>
            ) : (
              <input value={form.machine_no} onChange={(e) => setF("machine_no", e.target.value)}
                placeholder="e.g. C-05"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            )}
          </div>
          {hasSide && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Side</label>
              <select value={form.side ?? ""} onChange={(e) => setF("side", e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="">—</option>
                <option value="L">L</option>
                <option value="R">R</option>
              </select>
            </div>
          )}
          {hasTime && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Time</label>
              <input value={form.time_taken ?? ""} onChange={(e) => setF("time_taken", e.target.value)}
                placeholder="e.g. 9:30"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          )}
        </div>

        {/* Readings grid — 5 readings across */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-medium text-muted-foreground">
            Readings ({readingLabel}) — enter 5 samples
          </label>
          <div className="grid grid-cols-5 gap-2">
            {["r1","r2","r3","r4","r5"].map((rk, i) => (
              <div key={rk} className="space-y-1">
                <label className="text-[10px] text-muted-foreground text-center block">{i+1}</label>
                <input type="number" step="0.01" value={form[rk] ?? ""} onChange={(e) => setF(rk, e.target.value)}
                  placeholder="—"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            ))}
          </div>

          {/* Live computed results */}
          {avgWt != null && (
            <div className="flex gap-4 mt-2 p-2 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <div>
                <p className="text-[10px] text-muted-foreground">Avg Weight</p>
                <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{avgWt.toFixed(2)} {readingLabel}</p>
              </div>
              {hank != null && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Actual Hank</p>
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{hank.toFixed(4)}</p>
                </div>
              )}
              {cv != null && (
                <div>
                  <p className="text-[10px] text-muted-foreground">CV%</p>
                  <p className={`text-sm font-semibold ${cvOk ? "text-emerald-700 dark:text-emerald-400" : "text-red-600"}`}>
                    {cv.toFixed(2)}%
                    {cvOk === false && <span className="ml-1 text-[10px]">⚠ High</span>}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* OK & Remarks */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">OK / Input</label>
            <select value={form.ok_input ?? ""} onChange={(e) => setF("ok_input", e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">—</option>
              <option value="true">OK</option>
              <option value="false">Input</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Remarks</label>
            <input value={form.remarks ?? ""} onChange={(e) => setF("remarks", e.target.value)}
              placeholder="Optional"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <CustomFieldsSection
          tableName={sheetTableName}
          millId={millId}
          values={customFields}
          onChange={(key, value) => setCustomFields((p) => ({ ...p, [key]: value }))}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editRecord ? "Update record" : "Save record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Bag Weight Dialog — individual cone weight entry ─────────────────────────
function BagWeightDialog({ open, onClose, editRecord, millId, endpoint }: {
  open: boolean; onClose: () => void; editRecord: any | null;
  millId: string | null | undefined; endpoint: string;
}) {
  const qc = useQueryClient();
  const shiftOptions = useShifts();
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: today, shift_code: "", lot_no: "", count_ne: "", cone_tip_type: "",
    inspector: "", target_weight: "", remarks: "", status: "draft",
  });
  const [weights, setWeights] = useState<string[]>(Array(20).fill(""));

  useEffect(() => {
    if (editRecord) {
      setForm({
        date: editRecord.date ?? today, shift_code: editRecord.shift_code ?? "",
        lot_no: editRecord.lot_no ?? "", count_ne: editRecord.count_ne ?? "",
        cone_tip_type: editRecord.cone_tip_type ?? "", inspector: editRecord.inspector ?? "",
        target_weight: editRecord.target_weight ?? "", remarks: editRecord.remarks ?? "",
        status: editRecord.status ?? "draft",
      });
      const samples: any[] = editRecord.samples_json?.samples ?? [];
      const ws = samples.map((s: any) => String(s.net_wt ?? ""));
      setWeights([...ws, ...Array(Math.max(0, 20 - ws.length)).fill("")]);
    } else {
      setForm({ date: today, shift_code: "", lot_no: "", count_ne: "", cone_tip_type: "", inspector: "", target_weight: "", remarks: "", status: "draft" });
      setWeights(Array(20).fill(""));
    }
  }, [editRecord, open]);

  const nums = weights.map((w) => parseFloat(w)).filter((n) => !isNaN(n));
  const avgWt = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  const minWt = nums.length ? Math.min(...nums) : null;
  const maxWt = nums.length ? Math.max(...nums) : null;
  const stdDev = nums.length > 1 && avgWt != null
    ? Math.sqrt(nums.reduce((s, v) => s + (v - avgWt) ** 2, 0) / nums.length)
    : null;
  const target = parseFloat(form.target_weight);
  const under = !isNaN(target) && nums.length ? nums.filter((w) => w < target).length : 0;
  const over  = !isNaN(target) && nums.length ? nums.filter((w) => w > target).length : 0;
  const pass  = nums.length - under - over;
  const passPct = nums.length ? (pass / nums.length) * 100 : null;
  const devPct = !isNaN(target) && target > 0 && avgWt != null
    ? ((avgWt - target) / target) * 100 : null;

  // Use the dedicated endpoint (with server-side avg/min/max/pass% calculation)
  const dedicatedEndpoint = "/quality-forms/bag-weight";

  const handleSave = async () => {
    if (!form.date || !form.lot_no || !form.shift_code) {
      toast.error("Date, Shift and Lot No are required"); return;
    }
    setSaving(true);
    try {
      const samples_json = nums.map((w) => ({ net_wt: w }));
      const payload = {
        date: form.date, shift_code: form.shift_code, lot_no: form.lot_no,
        count_ne: form.count_ne !== "" ? parseFloat(form.count_ne) : null,
        cone_tip_type: form.cone_tip_type || null,
        inspector: form.inspector || null,
        target_weight: !isNaN(target) ? target : null,
        samples_json,
        remarks: form.remarks || null,
      };
      if (editRecord?.id) {
        await api.patch(`${dedicatedEndpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(dedicatedEndpoint, payload);
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? "Edit" : "Add Record"} — Bag Weight Checking</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Shift</label>
            <select value={form.shift_code} onChange={(e) => setForm((p) => ({ ...p, shift_code: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">Select shift…</option>
              {shiftOptions.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Lot No</label>
            <input value={form.lot_no} onChange={(e) => setForm((p) => ({ ...p, lot_no: e.target.value }))} placeholder="e.g. P-1916"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Count Ne</label>
            <input type="number" step="0.1" value={form.count_ne} onChange={(e) => setForm((p) => ({ ...p, count_ne: e.target.value }))} placeholder="26"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Cone Tip</label>
            <input value={form.cone_tip_type} onChange={(e) => setForm((p) => ({ ...p, cone_tip_type: e.target.value }))} placeholder="e.g. Green"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Inspector</label>
            <input value={form.inspector} onChange={(e) => setForm((p) => ({ ...p, inspector: e.target.value }))} placeholder="Name"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Target Wt (g)</label>
            <input type="number" step="0.01" value={form.target_weight} onChange={(e) => setForm((p) => ({ ...p, target_weight: e.target.value }))} placeholder="51.80"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1 col-span-2">
            <label className="text-xs font-medium text-muted-foreground">Remarks</label>
            <input value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} placeholder="Optional"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        {/* Individual cone weights grid */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground">
            Individual Cone Weights (g) — enter each cone net weight
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {weights.map((w, i) => (
              <div key={i} className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground text-center block">{i + 1}</label>
                <input type="number" step="0.01" value={w}
                  onChange={(e) => { const nw = [...weights]; nw[i] = e.target.value; setWeights(nw); }}
                  placeholder="—"
                  className={`flex h-8 w-full rounded border bg-background px-1.5 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring ${
                    !isNaN(parseFloat(w)) && !isNaN(target) && parseFloat(w) < target ? "border-red-300 text-red-600" :
                    !isNaN(parseFloat(w)) && !isNaN(target) && parseFloat(w) > target ? "border-amber-300 text-amber-600" :
                    "border-input"}`} />
              </div>
            ))}
          </div>
          <button onClick={() => setWeights((w) => [...w, ""])}
            className="text-xs text-primary underline">+ Add more</button>
        </div>

        {/* Auto-computed summary */}
        {avgWt != null && (
          <div className="grid grid-cols-4 gap-2 p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-center text-xs">
            <div><p className="text-[10px] text-muted-foreground">Avg Net Wt</p><p className="font-semibold text-emerald-700">{avgWt.toFixed(2)} g</p></div>
            <div><p className="text-[10px] text-muted-foreground">Min / Max</p><p className="font-semibold">{minWt?.toFixed(2)} / {maxWt?.toFixed(2)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Std Dev</p><p className="font-semibold">{stdDev?.toFixed(3) ?? "—"}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Pass% (Under/Over)</p>
              <p className={`font-semibold ${passPct != null && passPct < 90 ? "text-red-600" : "text-emerald-700"}`}>
                {passPct?.toFixed(1) ?? "—"}% ({under}↓/{over}↑)
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editRecord ? "Update record" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Paper Cone Dialog — individual cone weight entry ──────────────────────────
function PaperConeDialog({ open, onClose, editRecord, millId, endpoint }: {
  open: boolean; onClose: () => void; editRecord: any | null;
  millId: string | null | undefined; endpoint: string;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: today, supplier_name: "", batch_no: "", inspector: "", remarks: "", status: "draft",
  });
  const [weights, setWeights] = useState<string[]>(Array(20).fill(""));

  useEffect(() => {
    if (editRecord) {
      setForm({
        date: editRecord.date ?? today, supplier_name: editRecord.supplier_name ?? "",
        batch_no: editRecord.batch_no ?? "", inspector: editRecord.inspector ?? "",
        remarks: editRecord.remarks ?? "", status: editRecord.status ?? "draft",
      });
      const samples: any[] = editRecord.samples_json?.samples ?? [];
      const ws = samples.map((s: any) => String(s.cone_weight_g ?? ""));
      setWeights([...ws, ...Array(Math.max(0, 20 - ws.length)).fill("")]);
    } else {
      setForm({ date: today, supplier_name: "", batch_no: "", inspector: "", remarks: "", status: "draft" });
      setWeights(Array(20).fill(""));
    }
  }, [editRecord, open]);

  const nums = weights.map((w) => parseFloat(w)).filter((n) => !isNaN(n));
  const avgWt = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;

  const dedicatedEndpoint = "/quality-forms/paper-cone";

  const handleSave = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    setSaving(true);
    try {
      const payload = {
        date: form.date, supplier_name: form.supplier_name || null,
        batch_no: form.batch_no || null, inspector: form.inspector || null,
        samples_json: nums.map((w) => ({ cone_weight_g: w })),
        remarks: form.remarks || null,
      };
      if (editRecord?.id) {
        await api.patch(`${dedicatedEndpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(dedicatedEndpoint, payload);
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? "Edit" : "Add Record"} — Paper Cone Check</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Supplier</label>
            <input value={form.supplier_name} onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))} placeholder="NR"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Batch No</label>
            <input value={form.batch_no} onChange={(e) => setForm((p) => ({ ...p, batch_no: e.target.value }))} placeholder="Optional"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Remarks</label>
            <input value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} placeholder="Optional"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground">Individual Cone Weights (g)</label>
          <div className="grid grid-cols-5 gap-1.5">
            {weights.map((w, i) => (
              <div key={i} className="space-y-0.5">
                <label className="text-[10px] text-muted-foreground text-center block">{i + 1}</label>
                <input type="number" step="0.01" value={w}
                  onChange={(e) => { const nw = [...weights]; nw[i] = e.target.value; setWeights(nw); }}
                  placeholder="—"
                  className="flex h-8 w-full rounded border border-input bg-background px-1.5 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            ))}
          </div>
          <button onClick={() => setWeights((w) => [...w, ""])} className="text-xs text-primary underline">+ Add more</button>
        </div>

        {avgWt != null && (
          <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 text-xs">
            <span className="text-muted-foreground">Avg Cone Weight: </span>
            <span className="font-semibold text-emerald-700">{avgWt.toFixed(3)} g</span>
            <span className="text-muted-foreground ml-3">({nums.length} cones weighed)</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editRecord ? "Update record" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── CSP Strength Report Dialog — paper-style table ───────────────────────────
// Paper form: SI No | Strength (gf) | Weight (g) | Count (Ne) | CSP | Remarks
// CSP = Strength(gf) × Count(Ne)   [Count may differ per lea; entered per row]
// Summary rows: AVG, CV%, MAX, MIN
function CspDialog({ open, onClose, editRecord, millId, endpoint, department }: {
  open: boolean; onClose: () => void; editRecord: any | null;
  millId: string | null | undefined; endpoint: string; department?: string;
}) {
  const qc = useQueryClient();
  const { data: machines = [] } = useMachines(millId, department);
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const ROWS = 10;
  const makeDefaultForm = () => ({
    date: today, machine_no: "", lot_no: "", count_ne: "", ratio: "",
    tm: "", tpi: "", remarks: "", status: "draft",
  });
  const [form, setForm] = useState<Record<string, string>>(makeDefaultForm);
  // Per-row: strength (gf), weight (g), count (Ne — may vary), remarks
  const [strength,  setStrength]  = useState<string[]>(Array(ROWS).fill(""));
  const [weight,    setWeight]    = useState<string[]>(Array(ROWS).fill(""));
  const [rowCount,  setRowCount]  = useState<string[]>(Array(ROWS).fill("")); // per-row Ne
  const [rowRemark, setRowRemark] = useState<string[]>(Array(ROWS).fill(""));

  useEffect(() => {
    if (editRecord) {
      setForm({
        date: editRecord.date ?? today,
        machine_no: editRecord.machine_no ?? "",
        lot_no: editRecord.lot_no ?? "",
        count_ne: editRecord.count_ne != null ? String(editRecord.count_ne) : "",
        ratio: editRecord.ratio ?? "",
        tm: editRecord.tm != null ? String(editRecord.tm) : "",
        tpi: editRecord.tpi != null ? String(editRecord.tpi) : "",
        remarks: editRecord.remarks ?? "",
        status: editRecord.status ?? "draft",
      });
      // Load per-row arrays from s1_strength..s10_strength etc.
      const pad = (arr: (number|null)[], len: number) =>
        arr.concat(Array(len).fill(null)).slice(0, len).map((v) => v != null ? String(v) : "");
      const sArr = Array.from({length: ROWS}, (_, i) => editRecord[`s${i+1}_strength`] ?? null);
      const wArr = Array.from({length: ROWS}, (_, i) => editRecord[`s${i+1}_weight`]   ?? null);
      const cArr = Array.from({length: ROWS}, (_, i) => editRecord[`s${i+1}_count`]    ?? null);
      setStrength(pad(sArr, ROWS));
      setWeight(pad(wArr, ROWS));
      setRowCount(pad(cArr, ROWS));
      setRowRemark(Array(ROWS).fill(""));
    } else {
      setForm(makeDefaultForm());
      setStrength(Array(ROWS).fill(""));
      setWeight(Array(ROWS).fill(""));
      setRowCount(Array(ROWS).fill(""));
      setRowRemark(Array(ROWS).fill(""));
    }
  }, [editRecord, open]);

  // ── Auto-calculations ─────────────────────────────────────────────────────
  // TPI = TM × √Ne  (computed from header TM + Count Ne; user can still override)
  const headerNe = parseFloat(form.count_ne);
  const headerTm = parseFloat(form.tm);
  const autoTpi  = isFinite(headerTm) && headerTm > 0 && isFinite(headerNe) && headerNe > 0
    ? parseFloat((headerTm * Math.sqrt(headerNe)).toFixed(2)) : null;
  // TPI field shows computed value when user hasn't manually entered one
  const displayTpi = form.tpi !== "" ? form.tpi : (autoTpi != null ? String(autoTpi) : "");

  // Per-row Count (Ne) auto-computed from Weight (g) using wrap-reel formula:
  // Ne = (wrapYards × 453.592) / (840 × weight_g)
  // Standard lea = 120 yards (CSP test uses a 120-yard lea, not quadrant reel)
  const CSP_LEA_YARDS = 120;
  const weightToNe = (wg: number) =>
    wg > 0 ? (CSP_LEA_YARDS * 453.592) / (840 * wg) : null;

  // Per-row Ne: use manually typed value if present, else auto from weight
  const effectiveRowNe = weight.map((w, i) => {
    if (rowCount[i] !== "") return parseFloat(rowCount[i]);
    const wg = parseFloat(w);
    return isFinite(wg) && wg > 0 ? weightToNe(wg) : null;
  });

  // Per-row CSP = Strength × effective Ne (row or header)
  const rowCsp = strength.map((s, i) => {
    const str = parseFloat(s);
    const ne  = effectiveRowNe[i] ?? (isFinite(headerNe) && headerNe > 0 ? headerNe : null);
    return isFinite(str) && str > 0 && ne != null && ne > 0 ? str * ne : null;
  });

  // Stats from non-null CSP values
  const validCsp = rowCsp.filter((v) => v != null) as number[];
  const avgCsp = validCsp.length ? validCsp.reduce((a, b) => a + b, 0) / validCsp.length : null;
  const maxCsp = validCsp.length ? Math.max(...validCsp) : null;
  const minCsp = validCsp.length ? Math.min(...validCsp) : null;
  const cvCsp = (() => {
    if (validCsp.length < 2 || avgCsp == null) return null;
    const variance = validCsp.reduce((s, v) => s + (v - avgCsp) ** 2, 0) / (validCsp.length - 1);
    return (Math.sqrt(variance) / avgCsp) * 100;
  })();

  const sf = (v: string) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };

  const handleSave = async () => {
    if (!form.date || !form.machine_no) {
      toast.error("Date and Machine No are required"); return;
    }
    setSaving(true);
    try {
      const rowFields: Record<string, number | null> = {};
      for (let i = 0; i < ROWS; i++) {
        rowFields[`s${i+1}_strength`] = sf(strength[i]);
        rowFields[`s${i+1}_weight`]   = sf(weight[i]);
        rowFields[`s${i+1}_count`]    = sf(rowCount[i]);
        rowFields[`s${i+1}_csp`]      = rowCsp[i] != null ? parseFloat((rowCsp[i] as number).toFixed(1)) : null;
      }
      const payload = {
        date: form.date,
        machine_no: form.machine_no,
        lot_no: form.lot_no || null,
        count_ne: sf(form.count_ne),
        ratio: form.ratio || null,
        tm: sf(form.tm),
        // Save the manually typed TPI if given, otherwise the auto-computed value
        tpi: form.tpi !== "" ? sf(form.tpi) : autoTpi,
        avg_csp: avgCsp != null ? parseFloat(avgCsp.toFixed(1)) : null,
        cv_pct: cvCsp  != null ? parseFloat(cvCsp.toFixed(3))  : null,
        max_csp: maxCsp,
        min_csp: minCsp,
        within_spec: avgCsp != null ? avgCsp >= 2200 : null, // typical min spec
        remarks: form.remarks || null,
        ...rowFields,
      };
      if (editRecord?.id) {
        await api.patch(`${endpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(endpoint, payload);
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally { setSaving(false); }
  };

  const listId = useMemo(() => `csp-mc-${Math.random().toString(36).slice(2)}`, []);
  const inp = "w-full h-7 rounded border-0 bg-transparent px-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring";
  const hdr = "border border-border px-2 py-1.5 text-[10px] font-semibold text-center";
  const cel = "border border-border p-0.5";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? "Edit" : "Add Record"} — CSP Strength Report</DialogTitle>
        </DialogHeader>

        {/* Header fields */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: "date",     label: "Date",       type: "date" },
            { key: "lot_no",   label: "Lot No",     placeholder: "e.g. CR-80/20" },
            { key: "count_ne", label: "Count (Ne)", type: "number", step: "0.1", placeholder: "e.g. 24" },
            { key: "ratio",    label: "Ratio",      placeholder: "e.g. 80/20" },
            { key: "tm",       label: "TM",         type: "number", step: "0.01", placeholder: "e.g. 3.6" },
            { key: "remarks",  label: "Remarks",    placeholder: "Optional" },
          ].map(({ key, label, type = "text", step, placeholder }) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{label}</label>
              <input type={type} step={step} value={form[key]} placeholder={placeholder}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          ))}
          {/* TPI — auto-computed from TM × √Ne; user can override */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              TPI
              {autoTpi != null && form.tpi === "" && (
                <span className="text-[10px] text-emerald-600 font-normal">(auto)</span>
              )}
            </label>
            <input
              type="number" step="0.1"
              value={displayTpi}
              placeholder={autoTpi != null ? String(autoTpi) : "e.g. 21.6"}
              onChange={(e) => setForm((p) => ({ ...p, tpi: e.target.value }))}
              className={`flex h-9 w-full rounded-md border px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                form.tpi === "" && autoTpi != null
                  ? "border-emerald-300 bg-emerald-50/60 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300"
                  : "border-input bg-background"
              }`}
            />
            {autoTpi != null && (
              <p className="text-[10px] text-muted-foreground">TM × √Ne = {autoTpi}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Machine No</label>
            {machines.length > 0 ? (
              <><datalist id={listId}>{machines.map((m: any) => <option key={m.id} value={m.code} />)}</datalist>
                <input list={listId} value={form.machine_no} onChange={(e) => setForm((p) => ({ ...p, machine_no: e.target.value }))}
                  placeholder="e.g. RF_001" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
              </>
            ) : (
              <input value={form.machine_no} onChange={(e) => setForm((p) => ({ ...p, machine_no: e.target.value }))}
                placeholder="e.g. RF_001" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            )}
          </div>
        </div>

        {/* Reading table — matches physical paper */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground">
            Readings — Strength (gf) × Count (Ne) = CSP &nbsp;·&nbsp; 10 samples
            <span className="ml-2 text-[10px] text-emerald-600 font-normal">
              Count (Ne) auto-fills from Weight · TPI auto-fills from TM × √Ne
            </span>
          </label>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className={`${hdr} w-8`}>SI No</th>
                  <th className={`${hdr}`}>Strength (gf)</th>
                  <th className={`${hdr}`}>Weight (g)</th>
                  <th className={`${hdr}`}>Count (Ne)</th>
                  <th className={`${hdr} text-emerald-700`}>CSP</th>
                  <th className={`${hdr}`}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({length: ROWS}, (_, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                    <td className="border border-border px-2 py-1 text-center text-[10px] font-medium text-muted-foreground">{i + 1}</td>
                    <td className={cel}>
                      <input type="number" step="0.01" value={strength[i]} placeholder="—"
                        onChange={(e) => { const a = [...strength]; a[i] = e.target.value; setStrength(a); }}
                        className={inp} />
                    </td>
                    <td className={cel}>
                      <input type="number" step="0.01" value={weight[i]} placeholder="—"
                        onChange={(e) => { const a = [...weight]; a[i] = e.target.value; setWeight(a); }}
                        className={inp} />
                    </td>
                    <td className={`${cel} ${rowCount[i] === "" && effectiveRowNe[i] != null ? "bg-emerald-50/40 dark:bg-emerald-950/10" : ""}`}>
                      {/* Auto-computed from Weight if empty; user can type to override */}
                      <div className="relative">
                        <input type="number" step="0.01" value={rowCount[i]}
                          placeholder={effectiveRowNe[i] != null ? effectiveRowNe[i]!.toFixed(2) : (form.count_ne || "Ne")}
                          onChange={(e) => { const a = [...rowCount]; a[i] = e.target.value; setRowCount(a); }}
                          className={`${inp} ${rowCount[i] === "" && effectiveRowNe[i] != null ? "placeholder:text-emerald-600 placeholder:font-semibold" : ""}`} />
                      </div>
                    </td>
                    <td className={`${cel} bg-emerald-50/60 dark:bg-emerald-950/20`}>
                      <span className="block text-center font-semibold font-mono text-emerald-700 py-1">
                        {rowCsp[i] != null ? (rowCsp[i] as number).toFixed(0) : "—"}
                      </span>
                    </td>
                    <td className={cel}>
                      <input type="text" value={rowRemark[i]} placeholder=""
                        onChange={(e) => { const a = [...rowRemark]; a[i] = e.target.value; setRowRemark(a); }}
                        className={inp} />
                    </td>
                  </tr>
                ))}
                {/* AVG row */}
                <tr className="bg-muted/30 font-semibold">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center text-muted-foreground">AVG</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs">
                    {strength.map(parseFloat).filter(isFinite).length
                      ? (strength.map(parseFloat).filter(isFinite).reduce((a,b)=>a+b,0)/strength.map(parseFloat).filter(isFinite).length).toFixed(2) : "—"}
                  </td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs">—</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs">—</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono font-semibold text-emerald-700">
                    {avgCsp != null ? avgCsp.toFixed(1) : "—"}
                  </td>
                  <td className="border border-border" />
                </tr>
                {/* CV% row */}
                <tr className="bg-muted/20">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center text-muted-foreground">CV%</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs" colSpan={3}>—</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs font-semibold">
                    {cvCsp != null ? `${cvCsp.toFixed(2)}%` : "—"}
                  </td>
                  <td className="border border-border" />
                </tr>
                {/* MAX row */}
                <tr className="bg-muted/10">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center text-muted-foreground">MAX</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs" colSpan={3}>—</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs">
                    {maxCsp != null ? maxCsp.toFixed(0) : "—"}
                  </td>
                  <td className="border border-border" />
                </tr>
                {/* MIN row */}
                <tr className="bg-muted/10">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center text-muted-foreground">MIN</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs" colSpan={3}>—</td>
                  <td className="border border-border px-2 py-1.5 text-center font-mono text-xs">
                    {minCsp != null ? minCsp.toFixed(0) : "—"}
                  </td>
                  <td className="border border-border" />
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary panel */}
        {avgCsp != null && (
          <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 space-y-1.5">
            <div className="flex gap-4 text-xs">
              {[
                { label: "Avg CSP", val: avgCsp?.toFixed(1) },
                { label: "CV%",     val: cvCsp != null ? `${cvCsp.toFixed(2)}%` : "—" },
                { label: "Max",     val: maxCsp?.toFixed(0) },
                { label: "Min",     val: minCsp?.toFixed(0) },
              ].map(({ label, val }) => (
                <div key={label} className="flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-semibold font-mono text-emerald-800">{val ?? "—"}</p>
                </div>
              ))}
              <div className="flex-1 text-center">
                <p className="text-[10px] text-muted-foreground">Result</p>
                <p className={`font-semibold ${avgCsp >= 2200 ? "text-emerald-700" : "text-red-600"}`}>
                  {avgCsp >= 2200 ? "✓ OK" : "✗ NG"}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground border-t border-emerald-200 pt-1">
              CSP = Strength (gf) × Count (Ne) · Spec: Avg CSP ≥ 2200
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editRecord ? "Update record" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── A% Check Dialog — N+1 / N / N-1 three-column reading grid ────────────────
function ACheckDialog({ open, onClose, editRecord, millId, endpoint, department }: {
  open: boolean; onClose: () => void; editRecord: any | null;
  millId: string | null | undefined; endpoint: string; department?: string;
}) {
  const qc = useQueryClient();
  const { data: machines = [] } = useMachines(millId, department);
  const today = new Date().toISOString().slice(0, 10);
  const [saving, setSaving] = useState(false);
  const makeDefault = () => ({
    date: today, machine_no: "", lot_no: "", cotton_type: "", process: "",
    feed_hank: "", delivery_hank: "", doubling: "",
    levelling_action_point: "", levelling_intensity: "",
    remarks: "", status: "draft",
  });
  const [form, setForm] = useState<Record<string, string>>(makeDefault);
  // Wrap reel length — mill-specific. Common values:
  //   6.55 yards = quadrant balance short reel (AA Yarn Mills style)
  //   120 yards  = standard hank reel
  // Stored per-session; user can change if their mill uses a different reel.
  const [wrapYards, setWrapYards] = useState<string>("6.55");
  // 3 columns × 5 rows: nplus[0..4], n[0..4], nminus[0..4]
  const [nplus, setNplus] = useState<string[]>(Array(5).fill(""));
  const [n, setN] = useState<string[]>(Array(5).fill(""));
  const [nminus, setNminus] = useState<string[]>(Array(5).fill(""));

  useEffect(() => {
    if (editRecord) {
      setForm({
        date: editRecord.date ?? today, machine_no: editRecord.machine_no ?? "",
        lot_no: editRecord.lot_no ?? "", cotton_type: editRecord.cotton_type ?? "",
        process: editRecord.process ?? "",
        feed_hank: editRecord.feed_hank ?? "", delivery_hank: editRecord.delivery_hank ?? "",
        doubling: editRecord.doubling ?? "",
        levelling_action_point: editRecord.levelling_action_point ?? "",
        levelling_intensity: editRecord.levelling_intensity ?? "",
        remarks: editRecord.remarks ?? "", status: editRecord.status ?? "draft",
      });
      const rd = editRecord.readings_json ?? {};
      setNplus((rd.nplus ?? []).concat(Array(5).fill("")).slice(0, 5).map(String));
      setN((rd.n ?? []).concat(Array(5).fill("")).slice(0, 5).map(String));
      setNminus((rd.nminus ?? []).concat(Array(5).fill("")).slice(0, 5).map(String));
    } else {
      setForm(makeDefault());
      setNplus(Array(5).fill(""));
      setN(Array(5).fill(""));
      setNminus(Array(5).fill(""));
    }
  }, [editRecord, open]);

  const avgArr = (arr: string[]) => {
    const nums = arr.map(parseFloat).filter((x) => !isNaN(x) && x > 0);
    return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
  };
  const avgN = avgArr(n);
  const avgNplus = avgArr(nplus);
  const avgNminus = avgArr(nminus);

  // Convert avg gram weight → actual hank (Ne)
  // Formula: Hank = (wrapYards × 453.592 g/lb) / (840 yards/hank × avg_weight_g)
  // wrapYards is mill-specific — AA Yarn Mills uses 6.55 yards quadrant reel
  const wy = parseFloat(wrapYards);
  const gramsToHank = (avgG: number | null) =>
    avgG && avgG > 0 && wy > 0 ? (wy * 453.592) / (840 * avgG) : null;

  const hankN     = gramsToHank(avgN);
  const hankNplus = gramsToHank(avgNplus);
  const hankNminus = gramsToHank(avgNminus);

  // A% = deviation of N+1 / N-1 column from the N column (the baseline)
  // A%(n+1) = (hank_Nplus  - hank_N) / hank_N × 100
  // A%(n-1) = (hank_Nminus - hank_N) / hank_N × 100
  const aPctNplus  = hankNplus  != null && hankN ? ((hankNplus  - hankN) / hankN) * 100 : null;
  const aPctNminus = hankNminus != null && hankN ? ((hankNminus - hankN) / hankN) * 100 : null;

  const handleSave = async () => {
    if (!form.date || !form.machine_no || !form.lot_no) {
      toast.error("Date, Machine No and Lot No are required"); return;
    }
    setSaving(true);
    try {
      const nplusNums = nplus.map(parseFloat).filter((x) => !isNaN(x));
      const nNums = n.map(parseFloat).filter((x) => !isNaN(x));
      const nminusNums = nminus.map(parseFloat).filter((x) => !isNaN(x));
      // Store flat r1-r10 as N column readings (main set)
      const rFields: Record<string, number | null> = {};
      ["r1","r2","r3","r4","r5"].forEach((k, i) => { rFields[k] = nNums[i] ?? null; });
      ["r6","r7","r8","r9","r10"].forEach((k, i) => { rFields[k] = null; });
      const payload = {
        date: form.date, machine_no: form.machine_no, lot_no: form.lot_no,
        cotton_type: form.cotton_type || null, process: form.process || null,
        feed_hank: form.feed_hank !== "" ? parseFloat(form.feed_hank) : null,
        delivery_hank: form.delivery_hank !== "" ? parseFloat(form.delivery_hank) : null,
        doubling: form.doubling !== "" ? parseInt(form.doubling) : null,
        levelling_action_point: form.levelling_action_point !== "" ? parseFloat(form.levelling_action_point) : null,
        levelling_intensity: form.levelling_intensity !== "" ? parseFloat(form.levelling_intensity) : null,
        readings_json: { nplus: nplusNums, n: nNums, nminus: nminusNums },
        // avg_hank = actual hank of the N (baseline) column, derived from avg gram weight
        avg_hank: hankN != null ? parseFloat(hankN.toFixed(4)) : null,
        // A% = deviation of N+1/N-1 hank from N hank (auto-leveller effectiveness check)
        a_pct_n_plus: aPctNplus != null ? parseFloat(aPctNplus.toFixed(3)) : null,
        a_pct_n_minus: aPctNminus != null ? parseFloat(aPctNminus.toFixed(3)) : null,
        within_spec: aPctNplus != null && aPctNminus != null
          ? (Math.abs(aPctNplus) <= 0.5 && Math.abs(aPctNminus) <= 0.5) : null,
        remarks: form.remarks || null,
        ...rFields,
      };
      if (editRecord?.id) {
        await api.patch(`${endpoint}/${editRecord.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(endpoint, payload);
        toast.success("Saved");
      }
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
      onClose();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally { setSaving(false); }
  };

  const listId = useMemo(() => `acheck-mc-${Math.random().toString(36).slice(2)}`, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? "Edit" : "Add Record"} — A% Check (Auto-Leveller)</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Machine No</label>
            {machines.length > 0 ? (
              <><datalist id={listId}>{machines.map((m: any) => <option key={m.id} value={m.code} />)}</datalist>
                <input list={listId} value={form.machine_no} onChange={(e) => setForm((p) => ({ ...p, machine_no: e.target.value }))} placeholder="e.g. BD_005"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" /></>
            ) : (
              <input value={form.machine_no} onChange={(e) => setForm((p) => ({ ...p, machine_no: e.target.value }))} placeholder="e.g. BD_005"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Lot No</label>
            <input value={form.lot_no} onChange={(e) => setForm((p) => ({ ...p, lot_no: e.target.value }))} placeholder="e.g. CR-80/20"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Process</label>
            <select value={form.process} onChange={(e) => setForm((p) => ({ ...p, process: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">—</option>
              <option value="80/20">80/20</option>
              <option value="BD">BD</option>
              <option value="FD">FD</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Doubling</label>
            <input type="number" step="1" value={form.doubling} onChange={(e) => setForm((p) => ({ ...p, doubling: e.target.value }))} placeholder="6"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Delivery Hank</label>
            <input type="number" step="0.0001" value={form.delivery_hank} onChange={(e) => setForm((p) => ({ ...p, delivery_hank: e.target.value }))} placeholder="0.1100"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Levelling Action Pt</label>
            <input type="number" step="1" value={form.levelling_action_point} onChange={(e) => setForm((p) => ({ ...p, levelling_action_point: e.target.value }))} placeholder="942"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Levelling Intensity</label>
            <input type="number" step="0.1" value={form.levelling_intensity} onChange={(e) => setForm((p) => ({ ...p, levelling_intensity: e.target.value }))} placeholder="99.3"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Wrap Reel (yards)</label>
            <input type="number" step="0.01" min="0.1" value={wrapYards} onChange={(e) => setWrapYards(e.target.value)} placeholder="6.55"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            <p className="text-[10px] text-muted-foreground">6.55 yd = quadrant reel · 120 yd = full hank reel</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Remarks</label>
            <input value={form.remarks} onChange={(e) => setForm((p) => ({ ...p, remarks: e.target.value }))} placeholder="Optional"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>

        {/* N+1 / N / N-1 reading grid — matches physical paper form */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground">
            Readings (g) — weights from wrap reel, 5 samples per column
          </label>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40">
                  <th className="border border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground w-10">SI No</th>
                  <th className="border border-border px-3 py-1.5 text-[10px] font-semibold text-center">N+1</th>
                  <th className="border border-border px-3 py-1.5 text-[10px] font-semibold text-center">N</th>
                  <th className="border border-border px-3 py-1.5 text-[10px] font-semibold text-center">N-1</th>
                </tr>
              </thead>
              <tbody>
                {[0,1,2,3,4].map((i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                    <td className="border border-border px-2 py-1 text-center text-[10px] font-medium text-muted-foreground">{i + 1}</td>
                    {([
                      [nplus,  setNplus],
                      [n,      setN],
                      [nminus, setNminus],
                    ] as const).map(([vals, setter], ci) => (
                      <td key={ci} className="border border-border p-1">
                        <input
                          type="number" step="0.01"
                          value={(vals as string[])[i]}
                          onChange={(e) => {
                            const nw = [...(vals as string[])];
                            nw[i] = e.target.value;
                            (setter as any)(nw);
                          }}
                          placeholder="—"
                          className="w-full h-7 rounded border-0 bg-transparent px-1 text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Average row */}
                <tr className="bg-muted/30 font-semibold">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center text-muted-foreground">Avg</td>
                  {[
                    [nplus,  avgNplus],
                    [n,      avgN],
                    [nminus, avgNminus],
                  ].map(([, avg], ci) => (
                    <td key={ci} className="border border-border px-3 py-1.5 text-center font-mono text-xs text-foreground">
                      {(avg as number | null) != null ? (avg as number).toFixed(2) : "—"}
                    </td>
                  ))}
                </tr>
                {/* Hank row */}
                <tr className="bg-emerald-50 dark:bg-emerald-950/20">
                  <td className="border border-border px-2 py-1.5 text-[10px] text-center font-medium text-emerald-800">Hank</td>
                  {[hankNplus, hankN, hankNminus].map((h, ci) => (
                    <td key={ci} className="border border-border px-3 py-1.5 text-center font-mono text-xs font-semibold text-emerald-700">
                      {h != null ? h.toFixed(4) : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Auto-computed A% results */}
        {(hankN != null || aPctNplus != null || aPctNminus != null) && (
          <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 space-y-2">
            {/* Hank per column */}
            <div className="flex gap-3 text-xs">
              {[
                { label: "Hank N+1", val: hankNplus },
                { label: "Hank N (baseline)", val: hankN },
                { label: "Hank N-1", val: hankNminus },
              ].map(({ label, val }) => (
                <div key={label} className="flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                  <p className="font-semibold font-mono text-emerald-800">
                    {val != null ? val.toFixed(4) : "—"}
                  </p>
                </div>
              ))}
            </div>
            {/* A% values — deviation from N column */}
            <div className="flex gap-3 text-xs border-t border-emerald-200 pt-2">
              <div className="flex-1 text-center">
                <p className="text-[10px] text-muted-foreground">A% (N+1 vs N)</p>
                <p className={`font-semibold ${aPctNplus != null && Math.abs(aPctNplus) > 0.5 ? "text-red-600" : "text-emerald-700"}`}>
                  {aPctNplus != null ? `${aPctNplus >= 0 ? "+" : ""}${aPctNplus.toFixed(2)}%` : "—"}
                </p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[10px] text-muted-foreground">A% (N-1 vs N)</p>
                <p className={`font-semibold ${aPctNminus != null && Math.abs(aPctNminus) > 0.5 ? "text-red-600" : "text-emerald-700"}`}>
                  {aPctNminus != null ? `${aPctNminus >= 0 ? "+" : ""}${aPctNminus.toFixed(2)}%` : "—"}
                </p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[10px] text-muted-foreground">Auto-Leveller</p>
                <p className={`font-semibold ${aPctNplus != null && aPctNminus != null && Math.abs(aPctNplus) <= 0.5 && Math.abs(aPctNminus) <= 0.5 ? "text-emerald-700" : "text-red-600"}`}>
                  {aPctNplus != null && aPctNminus != null
                    ? (Math.abs(aPctNplus) <= 0.5 && Math.abs(aPctNminus) <= 0.5 ? "✓ OK" : "✗ NG")
                    : "—"}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground border-t border-emerald-200 pt-1">
              A% = (Hank_col − Hank_N) / Hank_N × 100 · Spec: ±0.5%
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : editRecord ? "Update record" : "Save record"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Letterhead custom body renderers ────────────────────────────────────────
// These draw a paper-matching table in jsPDF for specialised forms.
// Each returns the y position after the last drawn element.

/** A% Check — draws header fields + N+1/N/N-1 table + A% result box */
function drawACheckBody(
  doc: any, row: any, y: number,
  { pageW, margin }: { pageW: number; margin: number; pageH: number },
): number {
  const f = (v: any, dp = 2) => (v != null && v !== "" ? Number(v).toFixed(dp) : "—");
  const lw = pageW - margin * 2;

  // ── Header meta fields (2-column pairs) ──────────────────────────────────
  const headerFields = [
    ["Lot No",     row.lot_no ?? "—",   "Process",    row.process ?? "—"],
    ["Delivery Hank", f(row.delivery_hank, 4), "Doubling", row.doubling ?? "—"],
    ["Levelling Action Pt", f(row.levelling_action_point, 0), "Levelling Intensity", f(row.levelling_intensity, 1)],
    ["Remarks",    row.remarks ?? "—",  "Status",     (row.status ?? "—").toUpperCase()],
  ];
  const rh = 7;
  headerFields.forEach(([lk, lv, rk, rv], i) => {
    doc.setFillColor(...(i % 2 === 0 ? [252, 253, 255] : [246, 248, 252]) as [number,number,number]);
    doc.rect(margin - 1, y - 5, lw + 2, rh, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(70, 80, 100);
    doc.text(lk + ":", margin + 1, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
    doc.text(String(lv), margin + 42, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(70, 80, 100);
    doc.text(rk + ":", pageW / 2 + 4, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
    doc.text(String(rv), pageW / 2 + 46, y);
    y += rh;
  });

  y += 4;

  // ── N+1 / N / N-1 table ─────────────────────────────────────────────────
  const rd = row.readings_json ?? {};
  const nplus:  number[] = (rd.nplus  ?? []);
  const nArr:   number[] = (rd.n      ?? []);
  const nminus: number[] = (rd.nminus ?? []);
  const ROWS = Math.max(nplus.length, nArr.length, nminus.length, 5);

  const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const avgNplus  = avg(nplus.filter(Boolean));
  const avgN      = avg(nArr.filter(Boolean));
  const avgNminus = avg(nminus.filter(Boolean));

  const WY = 6.55; // default quadrant reel yards — matches dialog default
  const g2h = (g: number | null) => g && g > 0 ? (WY * 453.592) / (840 * g) : null;
  const hN      = g2h(avgN);
  const hNplus  = g2h(avgNplus);
  const hNminus = g2h(avgNminus);

  const colW   = (lw - 18) / 3;
  const siW    = 18;
  const tblRowH = 7.5;

  // Draw table header
  doc.setFillColor(30, 58, 138);
  doc.rect(margin, y, lw, tblRowH, "F");
  doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  doc.text("SI No", margin + siW / 2, y + 5, { align: "center" });
  ["N+1", "N", "N-1"].forEach((h, ci) => {
    doc.text(h, margin + siW + colW * ci + colW / 2, y + 5, { align: "center" });
  });
  y += tblRowH;

  // Data rows
  for (let i = 0; i < ROWS; i++) {
    const bg = i % 2 === 0 ? [255, 255, 255] : [245, 247, 250];
    doc.setFillColor(...bg as [number,number,number]);
    doc.rect(margin, y, lw, tblRowH, "F");
    doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.2);
    doc.rect(margin, y, lw, tblRowH);
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
    doc.text(String(i + 1), margin + siW / 2, y + 5, { align: "center" });
    const vals = [nplus[i], nArr[i], nminus[i]];
    vals.forEach((v, ci) => {
      const txt = v != null && !isNaN(Number(v)) ? Number(v).toFixed(2) : "—";
      doc.text(txt, margin + siW + colW * ci + colW / 2, y + 5, { align: "center" });
    });
    y += tblRowH;
  }

  // AVG row
  doc.setFillColor(235, 240, 250);
  doc.rect(margin, y, lw, tblRowH, "F");
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 58, 138);
  doc.text("Avg", margin + siW / 2, y + 5, { align: "center" });
  [avgNplus, avgN, avgNminus].forEach((v, ci) => {
    doc.text(v != null ? v.toFixed(2) : "—", margin + siW + colW * ci + colW / 2, y + 5, { align: "center" });
  });
  y += tblRowH;

  // Hank row
  doc.setFillColor(209, 250, 229);
  doc.rect(margin, y, lw, tblRowH, "F");
  doc.setFont("helvetica", "bold"); doc.setTextColor(6, 95, 70);
  doc.text("Hank", margin + siW / 2, y + 5, { align: "center" });
  [hNplus, hN, hNminus].forEach((v, ci) => {
    doc.text(v != null ? v.toFixed(4) : "—", margin + siW + colW * ci + colW / 2, y + 5, { align: "center" });
  });
  y += tblRowH + 5;

  // ── A% result box ────────────────────────────────────────────────────────
  const aNplus  = row.a_pct_n_plus  != null ? Number(row.a_pct_n_plus)  : null;
  const aNminus = row.a_pct_n_minus != null ? Number(row.a_pct_n_minus) : null;
  const ok = aNplus != null && aNminus != null && Math.abs(aNplus) <= 0.5 && Math.abs(aNminus) <= 0.5;

  doc.setFillColor(ok ? 209 : 254, ok ? 250 : 226, ok ? 229 : 226);
  doc.setDrawColor(ok ? 134 : 252, ok ? 239 : 165, ok ? 172 : 165);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, lw, 22, 2, 2, "FD");
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  doc.setTextColor(ok ? 6 : 153, ok ? 95 : 27, ok ? 70 : 27);

  const thirds = lw / 3;
  const items = [
    { label: "Hank N+1", val: hNplus  != null ? hNplus.toFixed(4)  : "—" },
    { label: "Hank N (baseline)", val: hN != null ? hN.toFixed(4) : "—" },
    { label: "Hank N-1", val: hNminus != null ? hNminus.toFixed(4) : "—" },
  ];
  items.forEach(({ label, val }, i) => {
    const cx = margin + thirds * i + thirds / 2;
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 100);
    doc.text(label, cx, y + 7, { align: "center" });
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
    doc.text(val, cx, y + 14, { align: "center" });
  });

  const resultItems = [
    { label: "A% (N+1 vs N)", val: aNplus  != null ? `${aNplus  >= 0 ? "+" : ""}${aNplus.toFixed(2)}%`  : "—" },
    { label: "A% (N-1 vs N)", val: aNminus != null ? `${aNminus >= 0 ? "+" : ""}${aNminus.toFixed(2)}%` : "—" },
    { label: "Auto-Leveller",  val: aNplus  != null && aNminus != null ? (ok ? "✓ OK" : "✗ NG") : "—" },
  ];
  y += 25;
  doc.setFillColor(ok ? 236 : 255, ok ? 253 : 237, ok ? 243 : 237);
  doc.setDrawColor(ok ? 167 : 253, ok ? 243 : 200, ok ? 208 : 200);
  doc.roundedRect(margin, y, lw, 18, 2, 2, "FD");
  resultItems.forEach(({ label, val }, i) => {
    const cx = margin + thirds * i + thirds / 2;
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 100);
    doc.text(label, cx, y + 6, { align: "center" });
    const isNg = val.includes("NG");
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.setTextColor(isNg ? 153 : (ok ? 6 : 20), isNg ? 27 : (ok ? 95 : 20), isNg ? 27 : (ok ? 70 : 20));
    doc.text(val, cx, y + 14, { align: "center" });
  });
  y += 22;

  doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(130);
  doc.text("A% = (Hank_col − Hank_N) / Hank_N × 100   Spec: ±0.5%", margin, y + 4);
  return y + 8;
}

/** CSP Strength Report — draws header + 10-row strength/CSP table + summary */
function drawCspBody(
  doc: any, row: any, y: number,
  { pageW, margin }: { pageW: number; margin: number; pageH: number },
): number {
  const f = (v: any, dp = 2) => (v != null && v !== "" ? Number(v).toFixed(dp) : "—");
  const lw = pageW - margin * 2;

  // ── Header meta ─────────────────────────────────────────────────────────
  const headerFields = [
    ["Lot No",    row.lot_no  ?? "—",  "Count (Ne)", f(row.count_ne, 1)],
    ["Ratio",     row.ratio   ?? "—",  "TM",         f(row.tm, 3)],
    ["TPI",       f(row.tpi, 2),       "Remarks",    row.remarks ?? "—"],
  ];
  const rh = 7;
  headerFields.forEach(([lk, lv, rk, rv], i) => {
    doc.setFillColor(...(i % 2 === 0 ? [252, 253, 255] : [246, 248, 252]) as [number,number,number]);
    doc.rect(margin - 1, y - 5, lw + 2, rh, "F");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(70, 80, 100);
    doc.text(lk + ":", margin + 1, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
    doc.text(String(lv), margin + 36, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(70, 80, 100);
    doc.text(rk + ":", pageW / 2 + 4, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(20, 20, 20);
    doc.text(String(rv), pageW / 2 + 38, y);
    y += rh;
  });
  y += 4;

  // ── Reading table ────────────────────────────────────────────────────────
  const ROWS = 10;
  // Column widths: SI | Strength | Weight | Count | CSP | Remarks
  const siW = 12; const strW = 28; const wtW = 24; const neW = 22; const cspW = 28;
  const remW = lw - siW - strW - wtW - neW - cspW;
  const tblRowH = 7;

  // Header row
  doc.setFillColor(30, 58, 138);
  doc.rect(margin, y, lw, tblRowH, "F");
  doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(255, 255, 255);
  let cx = margin;
  [["SI No", siW], ["Strength (gf)", strW], ["Weight (g)", wtW], ["Count (Ne)", neW], ["CSP", cspW], ["Remarks", remW]]
    .forEach(([h, w]) => {
      doc.text(String(h), cx + Number(w) / 2, y + 5, { align: "center" });
      cx += Number(w);
    });
  y += tblRowH;

  for (let i = 0; i < ROWS; i++) {
    const si = i + 1;
    const str = row[`s${si}_strength`];
    const wt  = row[`s${si}_weight`];
    const ne  = row[`s${si}_count`];
    const csp = row[`s${si}_csp`];
    const bg  = i % 2 === 0 ? [255, 255, 255] : [245, 247, 250];
    doc.setFillColor(...bg as [number,number,number]);
    doc.rect(margin, y, lw, tblRowH, "F");
    doc.setDrawColor(210, 215, 225); doc.setLineWidth(0.15);
    doc.rect(margin, y, lw, tblRowH);

    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
    cx = margin;
    const cells: [string, number][] = [
      [String(si),               siW],
      [f(str, 2),                strW],
      [f(wt, 2),                 wtW],
      [f(ne, 1),                 neW],
      [csp != null ? String(Math.round(Number(csp))) : "—", cspW],
      ["",                       remW],
    ];
    cells.forEach(([txt, w]) => {
      if (txt) doc.text(txt, cx + w / 2, y + 5, { align: "center" });
      cx += w;
    });

    // Highlight CSP cell green/red vs spec
    if (csp != null) {
      const cspNum = Number(csp);
      const ok2 = cspNum >= 2200;
      doc.setFillColor(ok2 ? 209 : 254, ok2 ? 250 : 226, ok2 ? 229 : 226);
      const cspX = margin + siW + strW + wtW + neW;
      doc.rect(cspX, y, cspW, tblRowH, "F");
      doc.setDrawColor(210, 215, 225);
      doc.rect(cspX, y, cspW, tblRowH);
      doc.setFontSize(8); doc.setFont("helvetica", "bold");
      doc.setTextColor(ok2 ? 6 : 153, ok2 ? 95 : 27, ok2 ? 70 : 27);
      doc.text(String(Math.round(cspNum)), cspX + cspW / 2, y + 5, { align: "center" });
    }
    y += tblRowH;
  }

  // Summary rows: AVG / CV% / MAX / MIN
  const summaryRows = [
    ["AVG", row.avg_csp != null ? Math.round(Number(row.avg_csp)).toString() : "—"],
    ["CV%", row.cv_pct  != null ? `${Number(row.cv_pct).toFixed(2)}%`        : "—"],
    ["MAX", row.max_csp != null ? Math.round(Number(row.max_csp)).toString()  : "—"],
    ["MIN", row.min_csp != null ? Math.round(Number(row.min_csp)).toString()  : "—"],
  ];
  summaryRows.forEach(([label, val]) => {
    doc.setFillColor(235, 240, 250);
    doc.rect(margin, y, lw, tblRowH, "F");
    doc.setDrawColor(190, 200, 225); doc.setLineWidth(0.2);
    doc.rect(margin, y, lw, tblRowH);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 58, 138);
    doc.text(label, margin + siW / 2, y + 5, { align: "center" });
    const cspX = margin + siW + strW + wtW + neW;
    doc.setFont("helvetica", "bold"); doc.setTextColor(20, 20, 20);
    doc.text(val, cspX + cspW / 2, y + 5, { align: "center" });
    y += tblRowH;
  });

  y += 5;

  // ── Summary box ──────────────────────────────────────────────────────────
  const avgCsp = row.avg_csp != null ? Number(row.avg_csp) : null;
  const cvPct  = row.cv_pct  != null ? Number(row.cv_pct)  : null;
  const ok = avgCsp != null && avgCsp >= 2200;

  doc.setFillColor(ok ? 209 : 254, ok ? 250 : 226, ok ? 229 : 226);
  doc.setDrawColor(ok ? 134 : 252, ok ? 239 : 165, ok ? 172 : 165);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, lw, 18, 2, 2, "FD");

  const quarters = lw / 4;
  [
    { label: "Avg CSP",  val: avgCsp != null ? avgCsp.toFixed(0)          : "—" },
    { label: "CV%",      val: cvPct  != null ? `${cvPct.toFixed(2)}%`     : "—" },
    { label: "Max",      val: row.max_csp != null ? Math.round(Number(row.max_csp)).toString() : "—" },
    { label: "Min",      val: row.min_csp != null ? Math.round(Number(row.min_csp)).toString() : "—" },
  ].forEach(({ label, val }, i) => {
    const qx = margin + quarters * i + quarters / 2;
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 90, 100);
    doc.text(label, qx, y + 6, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "bold");
    doc.setTextColor(ok ? 6 : 20, ok ? 95 : 20, ok ? 70 : 20);
    doc.text(val, qx, y + 14, { align: "center" });
  });
  y += 22;

  const resultTxt = avgCsp != null ? (ok ? "✓ PASS — Avg CSP ≥ 2200" : "✗ FAIL — Avg CSP < 2200") : "—";
  doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
  doc.setTextColor(ok ? 6 : 153, ok ? 95 : 27, ok ? 70 : 27);
  doc.text(resultTxt, margin, y + 4);
  doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(130);
  doc.text("CSP = Strength (gf) × Count (Ne)", pageW - margin, y + 4, { align: "right" });
  return y + 10;
}

// ── Main QmFormsTab: table + popup ──────────────────────────────────────────
function QmFormsTab({
  title, endpoint, columns, millId, millName, canEdit, layout = "grid",
  department, hasSide, hasProcess, hasTime, hankField = "std_hank", readingLabel = "g",
}: QmFormsTabProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["qm-tab", endpoint, millId, dateFrom, dateTo],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "500", date_from: dateFrom, date_to: dateTo });
      const res = await api.get(`${endpoint}?${p}`);
      return (res.data?.data ?? res.data ?? []) as any[];
    },
    enabled: !!millId,
    staleTime: 30_000,
  });

  const openAdd = () => { setEditRecord(null); setDialogOpen(true); };
  const openEdit = (row: any) => { setEditRecord(row); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditRecord(null); };

  const handleDelete = async (row: any) => {
    try {
      await api.delete(`${endpoint}/${row.id}`);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["qm-tab", endpoint] });
    } catch { toast.error("Delete failed"); }
  };

  // Build table columns for display — skip internal fields, show render if provided
  const tableCols = useMemo(() => {
    const BASE_SKIP = new Set(["id","mill_id","company_id","created_at","updated_at"]);
    // For sheet forms, build columns from known fields
    if (layout === "sheet") {
      return [
        { key: "date", label: "Date" },
        { key: "shift_code", label: "Shift" },
        { key: "lot_no", label: "Lot" },
        { key: "machine_no", label: "Mc No" },
        hasSide ? { key: "side", label: "Side" } : null,
        hasTime ? { key: "time_taken", label: "Time" } : null,
        { key: "r1", label: "R1" }, { key: "r2", label: "R2" },
        { key: "r3", label: "R3" }, { key: "r4", label: "R4" }, { key: "r5", label: "R5" },
        { key: "avg_weight", label: "Avg Wt" },
        { key: "actual_hank", label: "Hank" },
        { key: "cv_pct", label: "CV%" },
        { key: "ok_input", label: "OK?" },
        { key: "remarks", label: "Remarks" },
      ].filter(Boolean) as { key: string; label: string }[];
    }
    return columns.filter((c: any) => !BASE_SKIP.has(c.key));
  }, [columns, layout, hasSide, hasTime]);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] text-muted-foreground">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <span className="text-[10px] text-muted-foreground">To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{records.length} record{records.length !== 1 ? "s" : ""}</span>
            <ExportMenu
              columns={tableCols.map((c) => ({ key: c.key, label: c.label }))}
              rows={records}
              filename={title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}
              title={title}
              subtitle={`${dateFrom}${dateTo !== dateFrom ? ` → ${dateTo}` : ""}`}
              className="h-7"
            />
            {records.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                title="Export as letterhead PDF (one record per page)"
                onClick={() =>
                  exportToLetterheadPdf({
                    filename: title.replace(/[^a-z0-9]/gi, "_").toLowerCase(),
                    title,
                    millName,
                    subtitle: `${dateFrom}${dateTo !== dateFrom ? ` → ${dateTo}` : ""}`,
                    columns: tableCols.map((c) => ({ key: c.key, label: c.label })),
                    rows: records,
                    // Specialised forms get a custom body renderer so the PDF
                    // matches the paper form layout exactly.
                    drawCustomBody: endpoint.includes("a-pct") || endpoint.includes("a_pct_check")
                      ? drawACheckBody
                      : endpoint.includes("csp-report") || endpoint.includes("csp_report")
                        ? drawCspBody
                        : undefined,
                  })
                }
              >
                <FileText className="size-3" />
                Letterhead
              </Button>
            )}
            {canEdit && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={openAdd}>
                <Plus className="size-3" /> Add record
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading ? (
          <div className="px-4 py-6 text-xs text-muted-foreground">Loading…</div>
        ) : records.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No records for {dateFrom}{dateTo !== dateFrom ? ` → ${dateTo}` : ""}.{" "}
            {canEdit && (
              <button onClick={openAdd} className="underline text-primary hover:text-primary/80">Add one now</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left text-[10px] font-medium text-muted-foreground px-3 py-2 w-6">#</th>
                  {tableCols.map((c: any) => (
                    <th key={c.key} className="text-left text-[10px] font-medium text-muted-foreground px-2 py-2 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                  {canEdit && <th className="w-20 px-2 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {records.map((row, i) => (
                  <tr key={row.id}
                    onClick={() => canEdit && openEdit(row)}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors">
                    <td className="px-3 py-2 text-[10px] text-muted-foreground">{i + 1}</td>
                    {tableCols.map((col: any) => {
                      const v = row[col.key];
                      // Custom render from columns def
                      const colDef = columns.find((c: any) => c.key === col.key);
                      if (colDef?.render) return (
                        <td key={col.key} className="px-2 py-2">{colDef.render(row)}</td>
                      );
                      // Special renders
                      if (col.key === "ok_input") return (
                        <td key={col.key} className="px-2 py-2">
                          {v === true ? <span className="text-[10px] font-medium text-emerald-700">OK</span>
                            : v === false ? <span className="text-[10px] font-medium text-amber-600">Input</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                      if (col.key === "within_spec") return (
                        <td key={col.key} className="px-2 py-2">
                          {v === true ? <span className="text-[10px] font-medium text-emerald-700">OK</span>
                            : v === false ? <span className="text-[10px] font-medium text-red-600">NG</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                      if (col.key === "cv_pct" && v != null) return (
                        <td key={col.key} className="px-2 py-2">
                          <span className={Number(v) > 2 ? "text-red-600 font-medium" : "text-emerald-700 font-medium"}>
                            {Number(v).toFixed(2)}%
                          </span>
                        </td>
                      );
                      if (col.key === "avg_weight" && v != null) return (
                        <td key={col.key} className="px-2 py-2 text-emerald-700 font-medium">{Number(v).toFixed(2)}</td>
                      );
                      if (col.key === "actual_hank" && v != null) return (
                        <td key={col.key} className="px-2 py-2 text-emerald-700 font-medium">{Number(v).toFixed(4)}</td>
                      );
                      return (
                        <td key={col.key} className="px-2 py-2">
                          {v == null || v === "" ? <span className="text-muted-foreground/40">—</span> : String(v)}
                        </td>
                      );
                    })}
                    {canEdit && (
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(row)}
                            className="h-6 px-1.5 rounded border border-border text-muted-foreground hover:bg-muted text-[10px]">
                            <Pencil className="size-3" />
                          </button>
                          <ConfirmDeleteButton
                            onConfirm={() => handleDelete(row)}
                            label={`Delete this ${title} record?`}
                            successMessage="Deleted"
                          />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/40">
              Click any row to edit
            </p>
          </div>
        )}
      </CardContent>

      {/* Dialog — specialised per form type; falls back to sheet/grid */}
      {endpoint.includes("bag-weight") ? (
        <BagWeightDialog open={dialogOpen} onClose={closeDialog} editRecord={editRecord} millId={millId} endpoint={endpoint} />
      ) : endpoint.includes("paper-cone") ? (
        <PaperConeDialog open={dialogOpen} onClose={closeDialog} editRecord={editRecord} millId={millId} endpoint={endpoint} />
      ) : endpoint.includes("csp-report") || endpoint.includes("csp_report") ? (
        <CspDialog open={dialogOpen} onClose={closeDialog} editRecord={editRecord} millId={millId} endpoint={endpoint} department={department} />
      ) : endpoint.includes("a-pct") || endpoint.includes("a_pct_check") ? (
        <ACheckDialog open={dialogOpen} onClose={closeDialog} editRecord={editRecord} millId={millId} endpoint={endpoint} department={department} />
      ) : layout === "sheet" ? (
        <QmSheetDialog
          open={dialogOpen} onClose={closeDialog}
          title={title} endpoint={endpoint}
          editRecord={editRecord} millId={millId}
          department={department}
          hasSide={hasSide} hasProcess={hasProcess} hasTime={hasTime ?? true}
          hankField={hankField} readingLabel={readingLabel}
        />
      ) : (
        <QmGridDialog
          open={dialogOpen} onClose={closeDialog}
          title={title} endpoint={endpoint} columns={columns}
          editRecord={editRecord} millId={millId}
          department={department}
        />
      )}
    </Card>
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

// ─────────────────────────────────────────────────────────────────────────────
// SPINNING CALCULATIONS TAB — all formulas from Yarn-Calculations PDF
// ─────────────────────────────────────────────────────────────────────────────

function SpinCalcTab() {
  const [activeCalc, setActiveCalc] = useState<string>("count");
  const calcs = [
    { id: "count", label: "Count Conversion" },
    { id: "draft", label: "Draft" },
    { id: "tpi", label: "TPI / Twist" },
    { id: "production", label: "Production" },
    { id: "hank", label: "Hank / CV%" },
    { id: "blow_room", label: "Blow Room" },
    { id: "reference", label: "Formula Reference" },
  ];
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-medium">Spinning Calculations</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">All formulas from yarn count theory — auto-computed, no save needed.</p>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {calcs.map((c) => (
              <button key={c.id} onClick={() => setActiveCalc(c.id)}
                className={`px-3 py-1 text-xs rounded border transition-colors ${activeCalc === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                {c.label}
              </button>
            ))}
          </div>
          {activeCalc === "count" && <ScCountConversion />}
          {activeCalc === "draft" && <ScDraft />}
          {activeCalc === "tpi" && <ScTpi />}
          {activeCalc === "production" && <ScProduction />}
          {activeCalc === "hank" && <ScHankCv />}
          {activeCalc === "blow_room" && <ScBlowRoom />}
          {activeCalc === "reference" && <ScFormulaRef />}
        </CardContent>
      </Card>
    </div>
  );
}

function ScRow({ label, value, unit = "" }: { label: string; value: string | number | null | undefined; unit?: string }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold font-mono">
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 6 }) : value}
        {unit && <span className="text-muted-foreground ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function ScInput({ label, value, onChange, placeholder = "0", step = "0.001", unit = "" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; step?: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}{unit && ` (${unit})`}</label>
      <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary w-full" />
    </div>
  );
}

function ScBox({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 rounded bg-muted/40 border border-border p-3 space-y-0.5">{children}</div>;
}

function scRnd(n: number, dp = 4): number | null { return isFinite(n) && !isNaN(n) ? parseFloat(n.toFixed(dp)) : null; }
function scF(s: string): number | null { const v = parseFloat(s); return isNaN(v) || v <= 0 ? null : v; }
function scFi(s: string): number | null { const v = parseInt(s); return isNaN(v) || v <= 0 ? null : v; }

function ScCountConversion() {
  const [val, setVal] = useState("30");
  const [sys, setSys] = useState("ne");
  const v = parseFloat(val);
  const valid = isFinite(v) && v > 0;
  let tex: number | null = null;
  if (valid) { switch (sys) { case "ne": tex = 590.5 / v; break; case "nm": tex = 1000 / v; break; case "tex": tex = v; break; case "denier": tex = v / 9; break; case "grex": tex = v / 10; break; } }
  const ne = tex && tex > 0 ? scRnd(590.5 / tex) : null;
  const nm = tex && tex > 0 ? scRnd(1000 / tex, 3) : null;
  const denier = tex ? scRnd(tex * 9, 3) : null;
  const grex = tex ? scRnd(tex * 10, 3) : null;
  const texR = tex ? scRnd(tex, 4) : null;
  return (
    <div className="max-w-sm space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ScInput label="Count value" value={val} onChange={setVal} placeholder="30" step="0.1" />
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">System</label>
          <select value={sys} onChange={(e) => setSys(e.target.value)} className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground">
            <option value="ne">Ne (English)</option><option value="nm">Nm (Metric)</option><option value="tex">Tex</option><option value="denier">Denier</option><option value="grex">Grex</option>
          </select>
        </div>
      </div>
      {valid && tex && (<ScBox><ScRow label="Ne" value={ne} unit="hanks/lb" /><ScRow label="Nm" value={nm} unit="km/kg" /><ScRow label="Tex" value={texR} unit="g/1000m" /><ScRow label="Denier" value={denier} unit="g/9000m" /><ScRow label="Grex" value={grex} unit="g/10000m" /></ScBox>)}
      <p className="text-[10px] text-muted-foreground">Ne = 590.5/Tex · Nm = 1.6935×Ne · Denier = Tex×9 · 1 Hank = 840 yards</p>
    </div>
  );
}

function ScDraft() {
  const [sys, setSys] = useState<"indirect"|"direct">("indirect");
  const [cfed, setCfed] = useState(""); const [cdel, setCdel] = useState(""); const [dbl, setDbl] = useState("6");
  const cf = scF(cfed); const cd = scF(cdel); const db = scFi(dbl) ?? 1;
  const draft = cf && cd ? (sys === "indirect" ? scRnd((cd * db) / cf, 3) : scRnd((cf * db) / cd, 3)) : null;
  return (
    <div className="max-w-sm space-y-3">
      <div className="flex gap-2 mb-1">
        {(["indirect","direct"] as const).map((m) => (<button key={m} onClick={() => setSys(m)} className={`px-3 py-1 text-xs rounded border ${sys===m?"bg-primary text-primary-foreground border-primary":"border-border"}`}>{m==="indirect"?"Indirect (Ne/Nm)":"Direct (Tex/Denier)"}</button>))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <ScInput label="Count fed" value={cfed} onChange={setCfed} /><ScInput label="Count delivered" value={cdel} onChange={setCdel} /><ScInput label="Doubling" value={dbl} onChange={setDbl} placeholder="6" step="1" />
      </div>
      {draft !== null && (<ScBox><ScRow label="Actual Draft" value={draft} /></ScBox>)}
      <p className="text-[10px] text-muted-foreground">Indirect: (count_del × doubling)/count_fed · Direct: (count_fed × doubling)/count_del</p>
    </div>
  );
}

function ScTpi() {
  const [method, setMethod] = useState<"tm"|"speed">("tm");
  const [tm, setTm] = useState(""); const [ne, setNe] = useState("");
  const [flyerRpm, setFlyerRpm] = useState(""); const [frontDia, setFrontDia] = useState(""); const [frontRpm, setFrontRpm] = useState("");
  let tpi: number|null = null; let tpm: number|null = null; let tmCalc: number|null = null;
  if (method === "tm") { const tmV=scF(tm); const neV=scF(ne); if(tmV&&neV){tpi=scRnd(tmV*Math.sqrt(neV),3); tpm=tpi?scRnd(tpi*39.3701,2):null;} }
  else { const fr=scF(flyerRpm); const fd=scF(frontDia); const fn=scF(frontRpm); if(fr&&fd&&fn){const ss=Math.PI*fd*fn; tpi=scRnd(fr/ss,3); tpm=tpi?scRnd(tpi*39.3701,2):null; const neV=scF(ne); if(tpi&&neV)tmCalc=scRnd(tpi/Math.sqrt(neV),3);} }
  return (
    <div className="max-w-sm space-y-3">
      <div className="flex gap-2 mb-1">
        {(["tm","speed"] as const).map((m) => (<button key={m} onClick={() => setMethod(m)} className={`px-3 py-1 text-xs rounded border ${method===m?"bg-primary text-primary-foreground border-primary":"border-border"}`}>{m==="tm"?"TM × √Ne":"Speed method"}</button>))}
      </div>
      {method==="tm" ? (<div className="grid grid-cols-2 gap-2"><ScInput label="Twist Multiplier (TM)" value={tm} onChange={setTm} placeholder="3.8" /><ScInput label="Count (Ne)" value={ne} onChange={setNe} placeholder="30" /></div>) : (<div className="space-y-2"><div className="grid grid-cols-2 gap-2"><ScInput label="Flyer RPM" value={flyerRpm} onChange={setFlyerRpm} placeholder="700" step="1" /><ScInput label="Front roller dia (in)" value={frontDia} onChange={setFrontDia} placeholder="1.25" /></div><div className="grid grid-cols-2 gap-2"><ScInput label="Front roller RPM" value={frontRpm} onChange={setFrontRpm} placeholder="160" step="1" /><ScInput label="Count Ne (for TM)" value={ne} onChange={setNe} placeholder="30" /></div></div>)}
      {tpi !== null && (<ScBox><ScRow label="TPI" value={tpi} /><ScRow label="TPM" value={tpm} />{tmCalc!==null&&<ScRow label="Twist Multiplier" value={tmCalc} />}</ScBox>)}
      <p className="text-[10px] text-muted-foreground">TPI = TM×√Ne · TPI = flyer_rpm/(π×D_front×N_front) · TPM = TPI×39.37</p>
    </div>
  );
}

function ScProduction() {
  const [machine, setMachine] = useState("ring_frame");
  const [spRpm,setSpRpm]=useState(""); const [tpi,setTpi]=useState(""); const [ne,setNe]=useState("");
  const [spindles,setSpindles]=useState(""); const [eff,setEff]=useState("85"); const [shiftH,setShiftH]=useState("8");
  const [flyerDia,setFlyerDia]=useState(""); const [flyerRpm,setFlyerRpm]=useState(""); const [rovGrains,setRovGrains]=useState(""); const [sp2,setSp2]=useState("");

  const effN = parseFloat(eff)||85; const shN = parseFloat(shiftH)||8;
  const rfResult = useMemo(() => {
    const sr=scF(spRpm); const tp=scF(tpi); const cn=scF(ne); const as=scFi(spindles);
    if(!sr||!tp||!cn) return null;
    const oz=(sr*60/(tp*36))*(16*shN/(840*cn))*(effN/100);
    const kg=oz*0.028349;
    return {oz:scRnd(oz,5), kg:scRnd(kg,5), total:as?scRnd(kg*as,3):null};
  }, [spRpm,tpi,ne,spindles,effN,shN]);
  const spResult = useMemo(() => {
    const fd=scF(flyerDia); const fr=scF(flyerRpm); const rg=scF(rovGrains); const sp=scFi(sp2);
    if(!fd||!fr||!rg||!sp) return null;
    const lb=(Math.PI*fd*fr*60/36)*(rg/7000)*(effN/100)*sp;
    return {lb:scRnd(lb,3), kg:scRnd(lb*0.453592,3)};
  }, [flyerDia,flyerRpm,rovGrains,sp2,effN]);

  return (
    <div className="max-w-md space-y-3">
      <div className="flex flex-col gap-0.5">
        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Machine Type</label>
        <select value={machine} onChange={(e)=>setMachine(e.target.value)} className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground w-full max-w-xs">
          <option value="ring_frame">Ring Frame</option><option value="simplex">Simplex</option>
        </select>
      </div>
      {machine==="ring_frame" && (<div className="grid grid-cols-2 gap-2"><ScInput label="Spindle RPM" value={spRpm} onChange={setSpRpm} placeholder="18000" step="100" /><ScInput label="TPI" value={tpi} onChange={setTpi} placeholder="20" /><ScInput label="Count (Ne)" value={ne} onChange={setNe} placeholder="30" /><ScInput label="Active Spindles" value={spindles} onChange={setSpindles} placeholder="480" step="1" /><ScInput label="Efficiency %" value={eff} onChange={setEff} placeholder="85" /><ScInput label="Shift Hours" value={shiftH} onChange={setShiftH} placeholder="8" step="0.5" /></div>)}
      {machine==="simplex" && (<div className="grid grid-cols-2 gap-2"><ScInput label="Flyer Dia (in)" value={flyerDia} onChange={setFlyerDia} placeholder="3.5" /><ScInput label="Flyer RPM" value={flyerRpm} onChange={setFlyerRpm} placeholder="700" step="10" /><ScInput label="Roving (grains/yd)" value={rovGrains} onChange={setRovGrains} placeholder="60" /><ScInput label="Spindles" value={sp2} onChange={setSp2} placeholder="120" step="1" /><ScInput label="Efficiency %" value={eff} onChange={setEff} placeholder="85" /></div>)}
      {machine==="ring_frame" && rfResult && (<ScBox><ScRow label="oz/shift/spindle" value={rfResult.oz} unit="oz" /><ScRow label="kg/shift/spindle" value={rfResult.kg} unit="kg" />{rfResult.total!==null&&<ScRow label={`Total (${spindles} spindles)`} value={rfResult.total} unit="kg/shift" />}</ScBox>)}
      {machine==="simplex" && spResult && (<ScBox><ScRow label="Production" value={spResult.lb} unit="lb/hr" /><ScRow label="Production" value={spResult.kg} unit="kg/hr" /></ScBox>)}
      <p className="text-[10px] text-muted-foreground">Ring Frame: P = spindle_rpm×60/(TPI×36) × 16×shift_h/(840×Ne) × η</p>
    </div>
  );
}

function ScHankCv() {
  const [readings, setReadings] = useState<string[]>(Array(10).fill(""));
  const [stdHank, setStdHank] = useState(""); const [ly, setLy] = useState("120");
  const weights = readings.map((r) => parseFloat(r)).filter((v) => isFinite(v) && v > 0);
  const lyN = parseFloat(ly)||120; const sh = parseFloat(stdHank)||null;
  const result = useMemo(() => {
    if(!weights.length) return null;
    const avg = weights.reduce((s,v)=>s+v,0)/weights.length;
    const hank = (lyN*453.592)/(840*avg);
    const n = weights.length;
    let cv: number|null = null;
    if(n>=2){const variance=weights.reduce((s,v)=>s+(v-avg)**2,0)/(n-1); cv=(Math.sqrt(variance)/avg)*100;}
    const u = cv!==null ? cv/Math.sqrt(2) : null;
    let withinSpec: number|null = null;
    if(sh){const hanks=weights.map((w)=>(lyN*453.592)/(840*w)); const lo=sh*0.995; const hi=sh*1.005; withinSpec=scRnd((hanks.filter((h)=>h>=lo&&h<=hi).length/hanks.length)*100,1);}
    return {count:weights.length, avg:scRnd(avg,4), hank:scRnd(hank,4), cv:cv!==null?scRnd(cv,3):null, u:u!==null?scRnd(u,3):null, min:scRnd(Math.min(...weights),4), max:scRnd(Math.max(...weights),4), withinSpec};
  }, [JSON.stringify(weights), lyN, sh]);
  return (
    <div className="max-w-md space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ScInput label="Wrap length (yards)" value={ly} onChange={setLy} placeholder="120" step="1" />
        <ScInput label="Std hank (Ne)" value={stdHank} onChange={setStdHank} placeholder="0.1050" step="0.0001" />
      </div>
      <div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Individual weights (g) — up to 10</p>
        <div className="grid grid-cols-5 gap-1">
          {readings.map((v,i) => (<input key={i} type="number" step="0.1" value={v} onChange={(e)=>{const next=[...readings];next[i]=e.target.value;setReadings(next);}} placeholder={`R${i+1}`} className="h-8 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />))}
        </div>
      </div>
      {result && (<ScBox><ScRow label="Readings" value={result.count} /><ScRow label="Avg weight" value={result.avg} unit="g" /><ScRow label="Actual Hank (Ne)" value={result.hank} /><ScRow label="CV%" value={result.cv} unit="%" /><ScRow label="U% (approx)" value={result.u} unit="%" /><ScRow label="Min / Max" value={`${result.min} / ${result.max}`} unit="g" />{result.withinSpec!==null&&<ScRow label="Within ±0.5% of std hank" value={`${result.withinSpec}%`} />}</ScBox>)}
      <p className="text-[10px] text-muted-foreground">Hank (Ne) = (length_yards × 453.592) / (840 × avg_weight_g) · CV% = σ/mean × 100</p>
    </div>
  );
}

function ScBlowRoom() {
  const [trashFed,setTrashFed]=useState(""); const [trashDel,setTrashDel]=useState("");
  const [beaterRpm,setBeaterRpm]=useState(""); const [arms,setArms]=useState("2");
  const [feedDia,setFeedDia]=useState(""); const [feedRpm,setFeedRpm]=useState("");
  const tf=scF(trashFed); const td=parseFloat(trashDel); const br=scF(beaterRpm); const ar=parseInt(arms)||2; const fd=scF(feedDia); const fr=scF(feedRpm);
  const cleaningEff = tf&&isFinite(td)&&td>=0 ? scRnd(((tf-td)/tf)*100,3) : null;
  const bpi = br&&fd&&fr ? scRnd((br*ar)/(Math.PI*fd*fr),3) : null;
  return (
    <div className="max-w-sm space-y-3">
      <p className="text-xs font-medium border-b border-border/40 pb-1">Cleaning Efficiency</p>
      <div className="grid grid-cols-2 gap-2"><ScInput label="Trash fed %" value={trashFed} onChange={setTrashFed} placeholder="3.5" step="0.1" unit="%" /><ScInput label="Trash delivered %" value={trashDel} onChange={setTrashDel} placeholder="0.8" step="0.1" unit="%" /></div>
      {cleaningEff!==null&&(<ScBox><ScRow label="Cleaning Efficiency" value={cleaningEff} unit="%" /><ScRow label="Trash removed" value={tf&&isFinite(td)?scRnd(tf-td,3):null} unit="%" /></ScBox>)}
      <p className="text-xs font-medium border-b border-border/40 pb-1 mt-4">Beats per Inch</p>
      <div className="grid grid-cols-2 gap-2"><ScInput label="Beater RPM" value={beaterRpm} onChange={setBeaterRpm} placeholder="800" step="10" /><ScInput label="Arms / revolution" value={arms} onChange={setArms} placeholder="2" step="1" /><ScInput label="Feed roller dia (in)" value={feedDia} onChange={setFeedDia} placeholder="2.0" /><ScInput label="Feed roller RPM" value={feedRpm} onChange={setFeedRpm} placeholder="12" step="1" /></div>
      {bpi!==null&&(<ScBox><ScRow label="Beats per Inch" value={bpi} /></ScBox>)}
      <p className="text-[10px] text-muted-foreground">CE% = (trash_fed − trash_del)/trash_fed × 100 · BPI = beater_rpm × arms / (π × D_feed × N_feed)</p>
    </div>
  );
}

function ScFormulaRef() {
  const sections = [
    {title:"Count Systems",rows:[["Ne (English, indirect)","Hanks (840 yd) per lb — higher = finer"],["Nm (Metric, indirect)","km per kg"],["Tex (direct)","g per 1000 m"],["Denier (direct)","g per 9000 m"],["Grex (direct)","g per 10000 m"]]},
    {title:"Count Conversion",rows:[["Tex = 590.5 / Ne","Ne = 590.5 / Tex"],["Nm = 1.6935 × Ne","Ne = Nm / 1.6935"],["Denier = Tex × 9","Tex = Denier / 9"],["Grex = Tex × 10","1 Hank = 840 yards"]]},
    {title:"Twist",rows:[["TPI = TM × √Ne","TM: Simplex 1.0–1.4, Ring Frame 3.0–5.0"],["TPI = flyer_rpm / (π × D_front × N_front)",""],["TPM = TPI × 39.37",""]]},
    {title:"Draft",rows:[["Indirect (Ne/Nm)","Draft = (count_del × doubling) / count_fed"],["Direct (Tex/Denier)","Draft = (count_fed × doubling) / count_del"],["Mechanical Draft","(D_front × N_front) / (D_back × N_back)"]]},
    {title:"Production",rows:[["Scutcher","P(oz/hr) = π×D×N/36 × 60 × lap_wt_oz_yd × η"],["Card","P(lb/hr) = π×D×N/36 × 60 × gr_yd/7000 × tension × η"],["Draw Frame","P(lb/hr) = π×D×N/36 × 60 × gr_yd/7000 × η × heads × machines"],["Comber","P = f × π×D×N/36 × 60 × gr_yd/7000 × η × nips × heads × m × (1-waste%)"],["Simplex","P(lb/hr) = π×D×N/36 × 60 × roving_gr_yd/7000 × η × spindles"],["Ring Frame","P(oz/shift/sp) = spindle_rpm×60/(TPI×36) × 16×shift_h/(840×Ne) × η"]]},
    {title:"Quality",rows:[["Actual Hank (Ne)","(length_yards × 453.592) / (840 × weight_g)"],["CV%","(σ / mean) × 100  (σ = sample std dev)"],["U% (approx)","CV% / √2"],["Cleaning Efficiency","(trash_fed − trash_del) / trash_fed × 100"],["Beats per Inch","(beater_rpm × arms) / (π × D_feed × N_feed)"],["CSP","lea_strength_lb × count_Ne"],["Splice Efficiency","splice_strength / yarn_strength × 100"]]},
    {title:"Constants",rows:[["1 Hank","840 yards = 768.096 m"],["1 lb","453.592 g = 7000 grains"],["1 oz","28.349 g"],["1 inch","25.4 mm"],["Standard wrap","120 yards (1.5 yd arm × 80 laps)"]]},
  ];
  return (
    <div className="space-y-4 max-w-2xl">
      {sections.map((s) => (
        <div key={s.title}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 border-b border-border/40 pb-0.5">{s.title}</p>
          <table className="w-full text-xs"><tbody>{s.rows.map(([a,b],i) => (<tr key={i} className={i%2===0?"bg-muted/20":""}><td className="py-1 px-2 font-mono font-medium">{a}</td><td className="py-1 px-2 text-muted-foreground">{b}</td></tr>))}</tbody></table>
        </div>
      ))}
    </div>
  );
}

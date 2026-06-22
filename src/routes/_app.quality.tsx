import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { qualityApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useShifts } from "@/hooks/useMillConfig";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRBAC } from "@/hooks/useRBAC";
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
  Trash2,
  Pencil,
  Save,
  ChevronDown,
  X,
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
  const { canAccess } = useRBAC();
  const canEdit = canAccess("quality", true);
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
                  canEdit={canEdit}
                  layout="grid"
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

  const [form, setForm] = useState<Record<string, any>>(makeDefault);
  const [saving, setSaving] = useState(false);

  // Pre-fill when editing
  useEffect(() => {
    if (editRecord) {
      const d: Record<string, any> = {};
      formFields.forEach((f) => { d[f.key] = editRecord[f.key] ?? ""; });
      setForm(d);
    } else {
      setForm(makeDefault());
    }
  }, [editRecord, open, makeDefault, formFields]);

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

  const [form, setForm] = useState<Record<string, any>>(makeDefault);
  const [saving, setSaving] = useState(false);
  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (editRecord) {
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
      setForm(makeDefault());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRecord, open]);

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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{editRecord ? `Edit — ${title}` : `Add Record — ${title}`}</DialogTitle>
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

// ── CSV export helper ────────────────────────────────────────────────────────
function exportQmToCsv(title: string, columns: { key: string; label: string }[], records: any[]) {
  if (records.length === 0) { toast.info("No records to export"); return; }
  const cols = columns.filter((c) => !["id","mill_id","company_id","created_at","updated_at"].includes(c.key));
  const header = cols.map((c) => `"${c.label}"`).join(",");
  const rows = records.map((r) =>
    cols.map((c) => {
      const v = r[c.key];
      if (v == null || v === "") return "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${records.length} records`);
}

// ── Main QmFormsTab: table + popup ──────────────────────────────────────────
function QmFormsTab({
  title, endpoint, columns, millId, canEdit, layout = "grid",
  department, hasSide, hasProcess, hasTime, hankField = "std_hank", readingLabel = "g",
}: QmFormsTabProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(today);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["qm-tab", endpoint, millId, filterDate],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "200", date: filterDate });
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
            <span className="text-[10px] text-muted-foreground">Date</span>
            <input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{records.length} record{records.length !== 1 ? "s" : ""}</span>
            {records.length > 0 && (
              <Button
                size="sm" variant="outline" className="h-7 text-xs gap-1"
                onClick={() => exportQmToCsv(title, tableCols, records)}
                title="Export to CSV"
              >
                <ArrowUp className="size-3" /> Export
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
            No records for {filterDate}.{" "}
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

      {/* Dialog — grid (most forms) or sheet (wrapping/hank) */}
      {layout === "sheet" ? (
        <QmSheetDialog
          open={dialogOpen} onClose={closeDialog}
          title={title} endpoint={endpoint}
          editRecord={editRecord} millId={millId} department={department}
          hasSide={hasSide} hasProcess={hasProcess} hasTime={hasTime ?? true}
          hankField={hankField} readingLabel={readingLabel}
        />
      ) : (
        <QmGridDialog
          open={dialogOpen} onClose={closeDialog}
          title={title} endpoint={endpoint} columns={columns}
          editRecord={editRecord} millId={millId} department={department}
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

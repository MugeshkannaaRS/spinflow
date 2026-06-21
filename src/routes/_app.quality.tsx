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
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
                  layout="grid"
                />

                {/* ── Carding Waste % Study ── */}
                <QmFormsTab
                  title="Carding Waste % Study"
                  endpoint="/quality/v2/carding/waste-study"
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
                  layout="grid"
                />

                {/* ── Daily Carding Wrapping Report ── */}
                <QmFormsTab
                  title="Daily Carding Wrapping Report"
                  endpoint="/quality/v2/carding/wrapping"
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
// Quality Module — Fast data-entry forms
//
// Four patterns, pick by layout prop:
//   "grid"    — inline spreadsheet, all columns across (CV records, waste study)
//   "sheet"   — frozen page header + per-machine rows with inline readings + live compute
//               mirrors paper exactly: carding wrapping, sliver wrapping, simplex hank
//   "rows"    — shared date/shift/lot header + add-machine rows (breakage, snap)
//   "reading" — single-record entry with large reading grid (legacy fallback)
//
// All patterns: Tab/Enter keyboard navigation, per-row save, live computed columns.
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

const SHIFT_OPTIONS = ["A", "B", "C", "R/A", "R/B", "R/C"];
const STATUS_OPTIONS = ["draft", "approved", "rejected"];

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
// PATTERN "sheet" — Paper-mirrored wrapping / hank-test sheet
//
// Mirrors the physical A3 form exactly:
//   • Frozen page header: Process/Lot, Std Hank, Date, Shift (shared for whole sheet)
//   • One row per machine — columns: Mc No | Side | Time | R1 R2 R3 R4 R5 | Avg | Hank | CV% | OK | Remarks
//   • Avg weight, Actual Hank, CV% computed live as readings are typed
//   • Tab moves R1→R2→...→R5→next row; Enter saves the row
//   • Saved rows shown in same table (no separate list)
//   • Distinct background for unsaved entry rows vs saved rows
//
// Used for: carding wrapping, sliver wrapping, simplex hank test
// ═══════════════════════════════════════════════════════════════════════════

interface SheetPageHeader {
  date: string;
  shift_code: string;
  lot_no: string;
  process?: string;
  std_hank?: string;
  nominal_hank?: string;
  cotton_type?: string;
  [key: string]: string | undefined;
}

/** Compute live values for a wrapping/hank row */
function computeRow(row: Record<string, any>, stdHankNum: number | null): {
  avg: number | null; hank: number | null; cv: number | null;
} {
  const readings = ["r1","r2","r3","r4","r5"]
    .map((k) => (row[k] !== "" && row[k] != null ? parseFloat(row[k]) : null))
    .filter((v): v is number => v != null && !isNaN(v));
  if (readings.length === 0) return { avg: null, hank: null, cv: null };
  const avg = readings.reduce((a, b) => a + b, 0) / readings.length;
  // Actual hank = (Std Hank × Std Weight) / Avg Weight
  // Std Weight for wrapping = 453.59237 / std_hank (hanks from gram weight)
  const hank = stdHankNum && avg > 0 ? (stdHankNum * 453.59237) / avg : null;
  let cv: number | null = null;
  if (readings.length >= 2) {
    const mean = avg;
    const variance = readings.reduce((s, v) => s + (v - mean) ** 2, 0) / readings.length;
    cv = (Math.sqrt(variance) / mean) * 100;
  }
  return { avg, hank, cv };
}

function QmSheetEntry({
  title,
  endpoint,
  columns,
  millId,
  canEdit,
  hasSide = false,
  hasProcess = false,
  hasTime = true,
  hankField = "std_hank",
  readingLabel = "g",
}: {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
  hasSide?: boolean;
  hasProcess?: boolean;
  hasTime?: boolean;
  hankField?: "std_hank" | "nominal_hank";
  readingLabel?: string;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  // Page-level header (shared for all rows on this sheet)
  const [hdr, setHdr] = useState<SheetPageHeader>({
    date: today,
    shift_code: "R/A",
    lot_no: "",
    process: "",
    [hankField]: "",
    cotton_type: "",
  });
  const setH = (k: string, v: string) => setHdr((p) => ({ ...p, [k]: v }));

  const stdHankNum = parseFloat(hdr[hankField] ?? "") || null;

  // Extra per-row header fields (not shared)
  const makeBlankRow = useCallback(() => ({
    _id: crypto.randomUUID(),
    _saved: false,
    machine_no: "",
    side: "",
    time_taken: "",
    r1: "", r2: "", r3: "", r4: "", r5: "",
    ok_input: "",
    remarks: "",
  }), []);

  const [rows, setRows] = useState<Record<string, any>[]>(() => [makeBlankRow()]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["qm-sheet", endpoint, millId, hdr.date],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "200", date: hdr.date });
      const res = await api.get(`/api/v1${endpoint}?${p}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!millId,
    staleTime: 30_000,
  });

  const setRowField = (id: string, k: string, v: string) =>
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, [k]: v } : r)));

  const saveRow = async (row: Record<string, any>) => {
    setSavingId(row._id);
    try {
      const { avg, hank, cv } = computeRow(row, stdHankNum);
      const payload: Record<string, any> = {
        ...hdr,
        machine_no: row.machine_no,
        time_taken: row.time_taken || null,
        r1: row.r1 !== "" ? parseFloat(row.r1) : null,
        r2: row.r2 !== "" ? parseFloat(row.r2) : null,
        r3: row.r3 !== "" ? parseFloat(row.r3) : null,
        r4: row.r4 !== "" ? parseFloat(row.r4) : null,
        r5: row.r5 !== "" ? parseFloat(row.r5) : null,
        avg_weight: avg != null ? parseFloat(avg.toFixed(3)) : null,
        actual_hank: hank != null ? parseFloat(hank.toFixed(4)) : null,
        [hankField === "std_hank" ? "cv_pct" : "cv_pct"]: cv != null ? parseFloat(cv.toFixed(3)) : null,
        ok_input: row.ok_input === "true" ? true : row.ok_input === "false" ? false : null,
        remarks: row.remarks || null,
      };
      if (hasSide) payload["side"] = row.side || null;
      if (hasProcess) payload["process"] = hdr.process || null;
      if (row._saved && row.id) {
        await api.patch(`/api/v1${endpoint}/${row.id}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`/api/v1${endpoint}`, payload);
        toast.success("Saved");
        setRows((prev) => {
          const filtered = prev.filter((r) => r._id !== row._id);
          return [...filtered, makeBlankRow()];
        });
      }
      qc.invalidateQueries({ queryKey: ["qm-sheet", endpoint] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Save failed");
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row: Record<string, any>) => {
    if (!row._saved) { setRows((prev) => prev.filter((r) => r._id !== row._id)); return; }
    try {
      await api.delete(`/api/v1${endpoint}/${row.id}`);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["qm-sheet", endpoint] });
    } catch { toast.error("Delete failed"); }
  };

  // Flat list: saved rows first, then entry rows
  const allRows = useMemo(() => {
    const saved = (existing ?? []).map((r: any) => ({ ...r, _saved: true, _id: r.id }));
    return [...saved, ...rows];
  }, [existing, rows]);

  // Keyboard nav: Tab→next cell, Enter on r5 = save
  const READING_KEYS = ["r1","r2","r3","r4","r5"];
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: string,
    row: Record<string, any>,
  ) => {
    const rIdx = READING_KEYS.indexOf(colKey);
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (rIdx === READING_KEYS.length - 1) {
        // last reading → save
        saveRow(row);
      } else if (rIdx >= 0) {
        tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx}-${rIdx + 1}"]`)?.focus();
      }
    }
    if (e.key === "Tab" && !e.shiftKey && rIdx >= 0 && rIdx < READING_KEYS.length - 1) {
      e.preventDefault();
      tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx}-${rIdx + 1}"]`)?.focus();
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx + 1}-${rIdx}"]`)?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx - 1}-${rIdx}"]`)?.focus();
    }
  };

  return (
    <Card>
      {/* ── Page header (mirrors top of physical form) ── */}
      <CardHeader className="pb-2 pt-3 px-4 border-b border-border/40">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium mr-2 shrink-0">{title}</CardTitle>

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Date</span>
            <input type="date" value={hdr.date}
              onChange={(e) => setH("date", e.target.value)}
              className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Shift</span>
            <select value={hdr.shift_code} onChange={(e) => setH("shift_code", e.target.value)}
              className="h-7 text-xs border border-border rounded px-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
              {SHIFT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Process/Lot</span>
            <input value={hdr.lot_no} onChange={(e) => setH("lot_no", e.target.value)}
              placeholder="e.g. CR-80/20"
              className="h-7 text-xs border border-border rounded px-2 w-28 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {hasProcess && (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Process</span>
              <select value={hdr.process ?? ""} onChange={(e) => setH("process", e.target.value)}
                className="h-7 text-xs border border-border rounded px-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">—</option>
                <option value="BD">BD</option>
                <option value="FD">FD</option>
              </select>
            </div>
          )}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{hankField === "nominal_hank" ? "Nominal Hank" : "Std Hank"}</span>
            <input type="number" step="0.0001" value={hdr[hankField] ?? ""}
              onChange={(e) => setH(hankField, e.target.value)}
              placeholder="0.1000"
              className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          {stdHankNum && (
            <span className="text-[10px] text-muted-foreground ml-1">
              Range: ({(stdHankNum - stdHankNum * 0.005).toFixed(4)} – {(stdHankNum + stdHankNum * 0.005).toFixed(4)})
            </span>
          )}
          {canEdit && (
            <button onClick={() => setRows((p) => [...p, makeBlankRow()])}
              className="ml-auto flex items-center gap-1 h-7 px-2 text-xs border border-border rounded hover:bg-muted text-foreground shrink-0">
              <Plus className="size-3" /> Add row
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div ref={tableRef} className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-[10px] font-medium text-muted-foreground px-2 py-1.5 text-left w-6">#</th>
                  <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-left whitespace-nowrap">Mc No</th>
                  {hasSide && <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-left">Side</th>}
                  {hasTime && <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-left">Time</th>}
                  {["1","2","3","4","5"].map((n) => (
                    <th key={n} className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-center w-16">
                      {n} <span className="text-muted-foreground/50">({readingLabel})</span>
                    </th>
                  ))}
                  <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-center w-16 bg-emerald-50 dark:bg-emerald-950/20">Avg Wt</th>
                  <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-center w-16 bg-emerald-50 dark:bg-emerald-950/20">Hank</th>
                  <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-center w-14 bg-emerald-50 dark:bg-emerald-950/20">CV%</th>
                  <th className="text-[10px] font-medium text-muted-foreground px-1 py-1.5 text-center w-14">OK/In</th>
                  <th className="text-[10px] font-medium text-muted-foreground px-2 py-1.5 text-left">Remarks</th>
                  {canEdit && <th className="w-14"></th>}
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 && (
                  <tr><td colSpan={20} className="text-center text-muted-foreground py-6 text-xs">
                    Click "Add row" to start entry
                  </td></tr>
                )}
                {allRows.map((row, rowIdx) => {
                  const { avg, hank, cv } = row._saved
                    ? { avg: row.avg_weight, hank: row.actual_hank, cv: row.cv_pct ?? row.hank_cv_pct }
                    : computeRow(row, stdHankNum);
                  const cvOk = cv == null ? null : cv <= 2.0;

                  return (
                    <tr key={row._id ?? row.id}
                      className={["border-b border-border/50 transition-colors",
                        !row._saved ? "bg-primary/[0.04] hover:bg-primary/[0.07]" : "hover:bg-muted/30",
                      ].join(" ")}>
                      <td className="px-2 py-0.5 text-[10px] text-muted-foreground">{rowIdx + 1}</td>

                      {/* Mc No */}
                      <td className="px-1 py-0.5">
                        {row._saved ? (
                          <span className="text-xs font-medium px-1">{row.machine_no}</span>
                        ) : (
                          <input value={row.machine_no}
                            onChange={(e) => setRowField(row._id, "machine_no", e.target.value)}
                            placeholder="Mc"
                            className="h-7 w-14 text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                        )}
                      </td>

                      {/* Side (L/R) */}
                      {hasSide && (
                        <td className="px-1 py-0.5">
                          {row._saved ? (
                            <span className="text-xs px-1">{row.side ?? "—"}</span>
                          ) : (
                            <select value={row.side ?? ""}
                              onChange={(e) => setRowField(row._id, "side", e.target.value)}
                              className="h-7 text-xs border border-border rounded px-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                              <option value="">—</option>
                              <option value="L">L</option>
                              <option value="R">R</option>
                            </select>
                          )}
                        </td>
                      )}

                      {/* Time */}
                      {hasTime && (
                        <td className="px-1 py-0.5">
                          {row._saved ? (
                            <span className="text-xs px-1">{row.time_taken ?? "—"}</span>
                          ) : (
                            <input value={row.time_taken ?? ""}
                              onChange={(e) => setRowField(row._id, "time_taken", e.target.value)}
                              placeholder="2:30"
                              className="h-7 w-14 text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                          )}
                        </td>
                      )}

                      {/* R1–R5 reading cells */}
                      {READING_KEYS.map((rk, rIdx) => (
                        <td key={rk} className="px-0.5 py-0.5">
                          {row._saved ? (
                            <span className="text-xs text-center block w-full px-1">
                              {row[rk] != null ? Number(row[rk]).toFixed(2) : <span className="text-muted-foreground/40">—</span>}
                            </span>
                          ) : (
                            <input
                              type="number" step="0.01"
                              value={row[rk] ?? ""}
                              onChange={(e) => setRowField(row._id, rk, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, rowIdx, rk, row)}
                              ref={(el) => { if (el) el.setAttribute("data-cell", `${rowIdx}-${rIdx}`); }}
                              className="h-7 w-16 text-xs text-center border border-border rounded bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono" />
                          )}
                        </td>
                      ))}

                      {/* Live-computed avg */}
                      <td className="px-1 py-0.5 bg-emerald-50/60 dark:bg-emerald-950/10">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 block text-center">
                          {avg != null ? avg.toFixed(2) : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </td>

                      {/* Hank */}
                      <td className="px-1 py-0.5 bg-emerald-50/60 dark:bg-emerald-950/10">
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 block text-center">
                          {hank != null ? hank.toFixed(4) : <span className="text-muted-foreground/40">—</span>}
                        </span>
                      </td>

                      {/* CV% */}
                      <td className="px-1 py-0.5 bg-emerald-50/60 dark:bg-emerald-950/10">
                        <span className={["text-xs font-medium block text-center",
                          cvOk === true ? "text-emerald-700 dark:text-emerald-400" :
                          cvOk === false ? "text-red-600" : "text-muted-foreground/40"
                        ].join(" ")}>
                          {cv != null ? cv.toFixed(2) + "%" : "—"}
                        </span>
                      </td>

                      {/* OK/Input */}
                      <td className="px-1 py-0.5">
                        {row._saved ? (
                          row.ok_input === true ? (
                            <span className="text-[10px] font-medium text-emerald-700 px-1">OK</span>
                          ) : row.ok_input === false ? (
                            <span className="text-[10px] font-medium text-amber-600 px-1">Input</span>
                          ) : <span className="text-muted-foreground/40 text-xs px-1">—</span>
                        ) : (
                          <select value={row.ok_input ?? ""}
                            onChange={(e) => setRowField(row._id, "ok_input", e.target.value)}
                            className="h-7 text-xs border border-border rounded px-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary">
                            <option value="">—</option>
                            <option value="true">OK</option>
                            <option value="false">Input</option>
                          </select>
                        )}
                      </td>

                      {/* Remarks */}
                      <td className="px-1 py-0.5">
                        {row._saved ? (
                          <span className="text-xs px-1 text-muted-foreground">{row.remarks ?? ""}</span>
                        ) : (
                          <input value={row.remarks ?? ""}
                            onChange={(e) => setRowField(row._id, "remarks", e.target.value)}
                            placeholder="—"
                            className="h-7 w-24 text-xs border border-border rounded px-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
                        )}
                      </td>

                      {/* Actions */}
                      {canEdit && (
                        <td className="px-1 py-0.5">
                          <div className="flex gap-1">
                            {!row._saved && (
                              <button onClick={() => saveRow(row)} disabled={savingId === row._id}
                                className="h-6 px-2 text-[10px] font-medium rounded border border-emerald-400 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50">
                                {savingId === row._id ? "…" : "Save"}
                              </button>
                            )}
                            {row._saved && (
                              <button onClick={() => saveRow(row)} disabled={savingId === row._id}
                                className="h-6 px-1.5 rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50">
                                <Save className="size-3" />
                              </button>
                            )}
                            <button onClick={() => deleteRow(row)}
                              className="h-6 px-1.5 rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40">
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {/* Footer: totals row */}
              {allRows.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/30 border-t border-border">
                    <td colSpan={hasSide ? (hasTime ? 4 : 3) : (hasTime ? 3 : 2)} className="px-2 py-1 text-[10px] text-muted-foreground font-medium">
                      {allRows.length} rows
                    </td>
                    <td colSpan={5} />
                    <td className="px-1 py-1 text-center bg-emerald-50/60 dark:bg-emerald-950/10">
                      {(() => {
                        const avgs = allRows
                          .map((r) => r._saved ? r.avg_weight : computeRow(r, stdHankNum).avg)
                          .filter((v): v is number => v != null && !isNaN(v));
                        return avgs.length > 0
                          ? <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{(avgs.reduce((a,b)=>a+b,0)/avgs.length).toFixed(2)}</span>
                          : null;
                      })()}
                    </td>
                    <td className="px-1 py-1 bg-emerald-50/60 dark:bg-emerald-950/10" />
                    <td className="px-1 py-1 bg-emerald-50/60 dark:bg-emerald-950/10">
                      {(() => {
                        const cvs = allRows
                          .map((r) => r._saved ? (r.cv_pct ?? r.hank_cv_pct) : computeRow(r, stdHankNum).cv)
                          .filter((v): v is number => v != null && !isNaN(v));
                        const avgCv = cvs.length > 0 ? cvs.reduce((a,b)=>a+b,0)/cvs.length : null;
                        return avgCv != null
                          ? <span className={["text-[10px] font-medium", avgCv > 2 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"].join(" ")}>
                              {avgCv.toFixed(2)}%
                            </span>
                          : null;
                      })()}
                    </td>
                    <td colSpan={99} />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
        <div className="flex gap-4 px-3 py-1 border-t border-border/40 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Tab</kbd>/<kbd className="text-[9px] bg-muted border border-border rounded px-1">Enter</kbd> next reading &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Enter</kbd> on R5 = save row &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">↓↑</kbd> move rows &nbsp;
            <span className="text-muted-foreground/60">Green columns are auto-computed</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN A — Inline spreadsheet ("grid")
// One row per record. All fields as inline cells. Tab moves between cols.
// Computed fields (waste%, cv%) update live.
// ═══════════════════════════════════════════════════════════════════════════

function QmGridEntry({
  title,
  endpoint,
  columns,
  millId,
  canEdit,
}: {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [filterDate, setFilterDate] = useState(today);
  const [filterLot, setFilterLot] = useState("");
  const [filterMc, setFilterMc] = useState("");

  const formFields = useMemo<QmFieldDef[]>(() => {
    const base = columns
      .filter((c: any) => !["id", "mill_id", "company_id", "created_at", "updated_at"].includes(c.key))
      .map((c: any) => colToQmField(c.key, c.label));
    if (!base.find((f) => f.key === "remarks")) base.push({ key: "remarks", label: "Remarks", type: "text" });
    return base;
  }, [columns]);

  const makeBlankRow = useCallback(() => {
    const r: Record<string, any> = { _id: crypto.randomUUID(), _saved: false };
    formFields.forEach((f) => {
      if (f.key === "date") r[f.key] = filterDate || today;
      else if (f.key === "shift_code") r[f.key] = "A";
      else if (f.key === "status") r[f.key] = "draft";
      else r[f.key] = "";
    });
    return r;
  }, [formFields, filterDate, today]);

  const [rows, setRows] = useState<Record<string, any>[]>(() => [makeBlankRow()]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["qm-forms", endpoint, millId, filterDate, filterLot, filterMc],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "200" });
      if (filterDate) p.set("date", filterDate);
      if (filterLot) p.set("lot_no", filterLot);
      if (filterMc) p.set("machine_no", filterMc);
      const res = await api.get(`/api/v1${endpoint}?${p}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!millId,
    staleTime: 30_000,
  });

  // Add a blank entry row after loaded data
  const allRows = useMemo(() => {
    const saved = (existing ?? []).map((r: any) => ({ ...r, _saved: true, _id: r.id }));
    return [...saved, ...rows];
  }, [existing, rows]);

  const setRowField = (rowId: string, key: string, val: string) => {
    setRows((prev) =>
      prev.map((r) => (r._id === rowId ? { ...r, [key]: val } : r)),
    );
  };

  // Live computed: total_wastage_pct for waste study
  const getComputed = (row: Record<string, any>): Record<string, string> => {
    const computed: Record<string, string> = {};
    // Waste study: total_wastage_pct = total_waste / total_production * 100
    if ("licker_in2_waste_kg" in row || "flat_strips_kg" in row) {
      const prod = parseFloat(row.total_production_kg) || 0;
      if (prod > 0) {
        const waste = [
          "licker_in2_waste_kg", "licker_in3_waste_kg", "flat_strips_kg",
          "suction_hood_back_kg", "suction_hood_front_kg",
        ].reduce((s, k) => s + (parseFloat(row[k]) || 0), 0);
        computed["total_wastage_pct"] = (waste / prod * 100).toFixed(2) + "%";
      }
    }
    return computed;
  };

  const saveRow = async (row: Record<string, any>) => {
    setSavingId(row._id);
    try {
      const payload: Record<string, any> = {};
      formFields.forEach((f) => { payload[f.key] = parseVal(row[f.key], f.type); });
      if (row._saved && row.id) {
        await api.patch(`/api/v1${endpoint}/${row.id}`, payload);
      } else {
        await api.post(`/api/v1${endpoint}`, payload);
        // Remove this draft row (will be refetched as saved)
        setRows((prev) => prev.filter((r) => r._id !== row._id));
        setRows((prev) => [...prev, makeBlankRow()]);
      }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row: Record<string, any>) => {
    if (!row._saved) {
      setRows((prev) => prev.filter((r) => r._id !== row._id));
      return;
    }
    try {
      await api.delete(`/api/v1${endpoint}/${row.id}`);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number,
    row: Record<string, any>,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (colIdx === formFields.length - 1) {
        // Last col + Enter → save
        saveRow(row);
      } else {
        // Move to next cell
        const nextInput = tableRef.current?.querySelector<HTMLInputElement>(
          `[data-cell="${rowIdx}-${colIdx + 1}"]`,
        );
        nextInput?.focus();
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextInput = tableRef.current?.querySelector<HTMLInputElement>(
        `[data-cell="${rowIdx + 1}-${colIdx}"]`,
      );
      nextInput?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevInput = tableRef.current?.querySelector<HTMLInputElement>(
        `[data-cell="${rowIdx - 1}-${colIdx}"]`,
      );
      prevInput?.focus();
    }
  };

  // Render a cell value for saved (read) rows or an input for entry rows
  const renderCell = (
    row: Record<string, any>,
    field: QmFieldDef,
    rowIdx: number,
    colIdx: number,
  ) => {
    const isEntry = !row._saved;
    const computed = getComputed(row);
    // Computed display
    if (computed[field.key]) {
      return (
        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 px-1">
          {computed[field.key]}
        </span>
      );
    }
    if (!isEntry && !canEdit) {
      const v = row[field.key];
      return (
        <span className="text-xs px-1 text-foreground">
          {v == null || v === "" ? <span className="text-muted-foreground">—</span> : String(v)}
        </span>
      );
    }
    if (field.type === "shift") {
      return (
        <CellSelect
          value={String(row[field.key] ?? "A")}
          onChange={(v) => isEntry ? setRowField(row._id, field.key, v) : null}
          options={SHIFT_OPTIONS.map((o) => ({ value: o, label: o }))}
        />
      );
    }
    if (field.type === "status") {
      return (
        <CellSelect
          value={String(row[field.key] ?? "draft")}
          onChange={(v) => isEntry ? setRowField(row._id, field.key, v) : null}
          options={STATUS_OPTIONS.map((o) => ({ value: o, label: o.charAt(0).toUpperCase() + o.slice(1) }))}
        />
      );
    }
    if (field.type === "yn") {
      const cur =
        row[field.key] === true || row[field.key] === "true"
          ? "true"
          : row[field.key] === false || row[field.key] === "false"
            ? "false"
            : "";
      if (!isEntry) {
        return cur === "true" ? (
          <span className="text-xs font-medium text-emerald-700 px-1">OK</span>
        ) : cur === "false" ? (
          <span className="text-xs font-medium text-red-600 px-1">NG</span>
        ) : <span className="text-muted-foreground text-xs px-1">—</span>;
      }
      return (
        <CellSelect
          value={cur}
          onChange={(v) => setRowField(row._id, field.key, v)}
          options={[{ value: "", label: "—" }, { value: "true", label: "OK" }, { value: "false", label: "NG" }]}
        />
      );
    }
    if (!isEntry) {
      const v = row[field.key];
      return (
        <span className="text-xs px-1">
          {v == null || v === "" ? <span className="text-muted-foreground">—</span> : String(v)}
        </span>
      );
    }
    return (
      <CellInput
        value={row[field.key]}
        onChange={(v) => setRowField(row._id, field.key, v)}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        step={field.step}
        onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx, row)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputRef={(el: any) => {
          if (el) el.setAttribute("data-cell", `${rowIdx}-${colIdx}`);
        }}
      />
    );
  };

  return (
    <Card>
      {/* Header bar */}
      <CardHeader className="pb-2 pt-3 px-4 flex flex-row items-center gap-2 flex-wrap">
        <CardTitle className="text-sm font-medium mr-auto">{title}</CardTitle>
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          placeholder="Lot"
          value={filterLot}
          onChange={(e) => setFilterLot(e.target.value)}
          className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          placeholder="Mc No"
          value={filterMc}
          onChange={(e) => setFilterMc(e.target.value)}
          className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setRows((prev) => [...prev, makeBlankRow()])}
          >
            <Plus className="size-3 mr-1" /> Add row
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-0">
        <div ref={tableRef} className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left text-[10px] font-medium text-muted-foreground px-2 py-1.5 whitespace-nowrap w-6">#</th>
                  {formFields.map((f) => (
                    <th
                      key={f.key}
                      className="text-left text-[10px] font-medium text-muted-foreground px-1 py-1.5 whitespace-nowrap"
                    >
                      {f.label}
                    </th>
                  ))}
                  {canEdit && <th className="w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 && (
                  <tr>
                    <td colSpan={formFields.length + 2} className="text-center text-muted-foreground py-6 text-xs">
                      No records. Click "Add row" to start.
                    </td>
                  </tr>
                )}
                {allRows.map((row, rowIdx) => (
                  <tr
                    key={row._id ?? row.id}
                    className={[
                      "border-b border-border/60",
                      !row._saved ? "bg-primary/5" : "hover:bg-muted/30",
                    ].join(" ")}
                  >
                    <td className="px-2 py-1 text-[10px] text-muted-foreground text-center">{rowIdx + 1}</td>
                    {formFields.map((field, colIdx) => (
                      <td key={field.key} className="px-1 py-1">
                        {renderCell(row, field, rowIdx, colIdx)}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-1 py-1">
                        <div className="flex gap-1">
                          {!row._saved && (
                            <button
                              onClick={() => saveRow(row)}
                              disabled={savingId === row._id}
                              className="h-6 px-2 text-[10px] font-medium rounded border border-emerald-400 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                            >
                              {savingId === row._id ? "…" : "Save"}
                            </button>
                          )}
                          {row._saved && (
                            <button
                              onClick={() => saveRow(row)}
                              disabled={savingId === row._id}
                              className="h-6 px-1.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
                            >
                              <Save className="size-3" />
                            </button>
                          )}
                          <button
                            onClick={() => deleteRow(row)}
                            className="h-6 px-1.5 text-[10px] rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex gap-4 px-3 py-1.5 border-t border-border/40 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Tab</kbd> next cell &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Enter</kbd> save &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">↓↑</kbd> move rows
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN B — Header lock + reading grid ("reading")
// Fixed header (date/shift/lot/machine), then N reading cells in a grid.
// Computed avg, cv%, actual_hank update live as user types.
// ═══════════════════════════════════════════════════════════════════════════

function QmReadingEntry({
  title,
  endpoint,
  columns,
  millId,
  canEdit,
}: {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const formFields = useMemo<QmFieldDef[]>(() => {
    const base = columns
      .filter((c: any) => !["id", "mill_id", "company_id", "created_at", "updated_at"].includes(c.key))
      .map((c: any) => colToQmField(c.key, c.label));
    if (!base.find((f) => f.key === "remarks")) base.push({ key: "remarks", label: "Remarks", type: "text" });
    return base;
  }, [columns]);

  // Split fields into header fields, reading fields (r1-r10, s1_* etc.), and other fields
  const headerFields = formFields.filter((f) => HEADER_KEYS.has(f.key) || f.key === "machine_no");
  const readingFields = formFields.filter((f) => /^r\d+$|^s\d+_(strength|weight|count|csp)$/.test(f.key));
  const otherFields = formFields.filter(
    (f) => !HEADER_KEYS.has(f.key) && f.key !== "machine_no" && !/^r\d+$|^s\d+_(strength|weight|count|csp)$/.test(f.key),
  );

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
  const [filterDate, setFilterDate] = useState(today);
  const [editId, setEditId] = useState<string | null>(null);
  const readingRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Live computed values
  const readingVals = readingFields
    .filter((f) => /^r\d+$/.test(f.key))
    .map((f) => (form[f.key] !== "" && form[f.key] != null ? parseFloat(form[f.key]) : null));

  const liveAvgWeight = avg(readingVals);
  const liveCvPct = cvPct(readingVals);
  // actual_hank = 1000 / (avg_weight_g * 1.6535) if std_hank context available
  // For now: actual_hank from std_hank (if user filled std_hank field from nearby field)
  const stdHank = parseFloat(form["std_hank"] ?? form["nominal_hank"]) || null;
  const liveActualHank =
    liveAvgWeight && stdHank
      ? (stdHank * 453.59237) / liveAvgWeight  // hanks calculated from weight ratio
      : null;

  const { data: existing, isLoading } = useQuery({
    queryKey: ["qm-forms", endpoint, millId, filterDate],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "100", date: filterDate });
      const res = await api.get(`/api/v1${endpoint}?${p}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!millId,
    staleTime: 30_000,
  });

  const loadRecord = (r: any) => {
    const f: Record<string, any> = {};
    formFields.forEach((fd) => { f[fd.key] = r[fd.key] ?? ""; });
    setForm(f);
    setEditId(r.id);
  };

  const clearForm = () => {
    setForm(makeDefault());
    setEditId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};
      formFields.forEach((f) => { payload[f.key] = parseVal(form[f.key], f.type); });
      // Inject computed
      if (liveAvgWeight != null) payload["avg_weight"] = parseFloat(liveAvgWeight.toFixed(3));
      if (liveCvPct != null) payload["cv_pct"] = parseFloat(liveCvPct.toFixed(3));
      if (liveActualHank != null) payload["actual_hank"] = parseFloat(liveActualHank.toFixed(4));
      if (editId) {
        await api.patch(`/api/v1${endpoint}/${editId}`, payload);
        toast.success("Updated");
      } else {
        await api.post(`/api/v1${endpoint}`, payload);
        toast.success("Saved");
        clearForm();
      }
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, val: string) => setForm((p) => ({ ...p, [key]: val }));

  const readingKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const next = readingRefs.current[idx + 1];
      if (next) next.focus();
      else handleSave();
    }
  };

  return (
    <Card>
      {/* Locked header */}
      <CardHeader className="pb-0 pt-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium mr-2">{title}</CardTitle>
          {/* Header fields inline */}
          {headerFields.map((f) => (
            <div key={f.key} className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{f.label}</span>
              {f.type === "shift" ? (
                <CellSelect
                  value={String(form[f.key] ?? "A")}
                  onChange={(v) => setField(f.key, v)}
                  options={SHIFT_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              ) : f.type === "date" ? (
                <input
                  type="date"
                  value={form[f.key] ?? today}
                  onChange={(e) => { setField(f.key, e.target.value); setFilterDate(e.target.value); }}
                  className="h-7 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <input
                  value={form[f.key] ?? ""}
                  onChange={(e) => setField(f.key, e.target.value)}
                  placeholder={f.key === "machine_no" ? "Mc No" : f.key === "lot_no" ? "Lot" : "—"}
                  className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
          {editId && (
            <button onClick={clearForm} className="text-[10px] text-muted-foreground hover:text-foreground ml-1 flex items-center gap-0.5">
              <X className="size-3" /> Clear
            </button>
          )}
        </div>

        {/* Other fields (speeds, nominal_hank, count_ne etc.) — compact row */}
        {otherFields.filter((f) => !["status", "remarks", "within_spec", "ok_input",
          "avg_weight", "actual_hank", "cv_pct", "hank_cv_pct", "total_wastage_pct", "avg_hank",
          "avg_csp", "max_csp", "min_csp"].includes(f.key)).length > 0 && (
          <div className="flex gap-3 flex-wrap mt-2 pb-2 border-b border-border/40">
            {otherFields
              .filter((f) => !["status", "remarks", "within_spec", "ok_input",
                "avg_weight", "actual_hank", "cv_pct", "hank_cv_pct", "total_wastage_pct", "avg_hank",
                "avg_csp", "max_csp", "min_csp"].includes(f.key))
              .map((f) => (
                <div key={f.key} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{f.label}</span>
                  {f.type === "yn" ? (
                    <CellSelect
                      value={form[f.key] === true || form[f.key] === "true" ? "true" : form[f.key] === false || form[f.key] === "false" ? "false" : ""}
                      onChange={(v) => setField(f.key, v)}
                      options={[{ value: "", label: "—" }, { value: "true", label: "OK" }, { value: "false", label: "NG" }]}
                    />
                  ) : (
                    <input
                      type={f.type === "number" ? "number" : "text"}
                      step={f.step}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  )}
                </div>
              ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="px-4 pt-3 pb-3">
        {/* Reading grid */}
        {readingFields.length > 0 && (
          <>
            <p className="text-[10px] text-muted-foreground mb-2">
              Enter readings — Tab or Enter to advance
            </p>
            <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(readingFields.length, 5)}, 1fr)` }}>
              {readingFields.map((f, idx) => (
                <div key={f.key} className="flex flex-col gap-1">
                  <span className="text-[10px] text-center text-muted-foreground">{f.label}</span>
                  <input
                    ref={(el) => { readingRefs.current[idx] = el; }}
                    type="number"
                    step={f.step ?? "0.01"}
                    value={form[f.key] ?? ""}
                    onChange={(e) => setField(f.key, e.target.value)}
                    onKeyDown={(e) => readingKeyDown(e, idx)}
                    className="h-9 text-sm text-center border border-border rounded bg-background text-foreground font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary w-full"
                  />
                </div>
              ))}
            </div>

            {/* Live computed bar */}
            {(liveAvgWeight != null || liveCvPct != null) && (
              <div className="flex gap-4 mt-3 px-3 py-2 rounded-md bg-muted/40 border border-border/40 flex-wrap">
                {liveAvgWeight != null && (
                  <span className="text-xs">
                    <span className="text-muted-foreground">Avg </span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">{liveAvgWeight.toFixed(2)} g</span>
                  </span>
                )}
                {liveCvPct != null && (
                  <span className="text-xs">
                    <span className="text-muted-foreground">CV% </span>
                    <span className={`font-medium ${liveCvPct > 2 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
                      {liveCvPct.toFixed(2)}%
                    </span>
                  </span>
                )}
                {liveActualHank != null && (
                  <span className="text-xs">
                    <span className="text-muted-foreground">Actual hank </span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">{liveActualHank.toFixed(4)}</span>
                  </span>
                )}
                <span className={`text-xs font-medium ml-auto ${liveCvPct != null && liveCvPct > 2 ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}`}>
                  {liveCvPct != null ? (liveCvPct > 2 ? "⚠ High CV" : "✓ Within spec") : ""}
                </span>
              </div>
            )}
          </>
        )}

        {/* Remarks */}
        <div className="flex gap-2 mt-3 items-center">
          <input
            placeholder="Remarks (optional)"
            value={form["remarks"] ?? ""}
            onChange={(e) => setField("remarks", e.target.value)}
            className="flex-1 h-8 text-xs border border-border rounded px-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {canEdit && (
            <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
              <Save className="size-3 mr-1" />
              {saving ? "Saving…" : editId ? "Update" : "Save record"}
            </Button>
          )}
        </div>

        {/* Saved records list */}
        {(existing?.length ?? 0) > 0 && (
          <div className="mt-4 border-t border-border/40 pt-3">
            <p className="text-[10px] font-medium text-muted-foreground mb-2">
              {existing!.length} record{existing!.length !== 1 ? "s" : ""} saved for {filterDate}
            </p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {existing!.map((r: any) => (
                <div
                  key={r.id}
                  onClick={() => loadRecord(r)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded border border-border/40 hover:bg-muted/40 cursor-pointer text-xs"
                >
                  <span className="font-medium text-muted-foreground w-12">{r.machine_no ?? "—"}</span>
                  <span className="text-muted-foreground">{r.shift_code ?? "—"}</span>
                  {r.avg_weight != null && <span className="text-emerald-700 dark:text-emerald-400">avg {Number(r.avg_weight).toFixed(2)}g</span>}
                  {r.cv_pct != null && <span className="text-muted-foreground">CV {Number(r.cv_pct).toFixed(2)}%</span>}
                  {r.avg_csp != null && <span className="text-emerald-700 dark:text-emerald-400">CSP {r.avg_csp}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">click to edit</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PATTERN C — Shared header + per-machine rows ("rows")
// Date/shift/lot/count_ne locked in header, one row per machine.
// Used for breakage study, snap study, A% check, yarn faults.
// ═══════════════════════════════════════════════════════════════════════════

function QmRowsEntry({
  title,
  endpoint,
  columns,
  millId,
  canEdit,
}: {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const formFields = useMemo<QmFieldDef[]>(() => {
    const base = columns
      .filter((c: any) => !["id", "mill_id", "company_id", "created_at", "updated_at"].includes(c.key))
      .map((c: any) => colToQmField(c.key, c.label));
    if (!base.find((f) => f.key === "remarks")) base.push({ key: "remarks", label: "Remarks", type: "text" });
    return base;
  }, [columns]);

  // Split: shared header vs per-row fields
  const SHARED_KEYS = new Set(["date", "shift_code", "lot_no", "count_ne", "ratio", "tm", "rh",
    "duration_hrs", "cotton_type", "process"]);
  const headerFields = formFields.filter((f) => SHARED_KEYS.has(f.key));
  const rowFields = formFields.filter((f) => !SHARED_KEYS.has(f.key) && f.key !== "status");

  const [header, setHeader] = useState<Record<string, any>>(() => {
    const h: Record<string, any> = {};
    headerFields.forEach((f) => {
      if (f.key === "date") h[f.key] = today;
      else if (f.key === "shift_code") h[f.key] = "A";
      else h[f.key] = "";
    });
    return h;
  });
  const setHeaderField = (key: string, val: string) => setHeader((p) => ({ ...p, [key]: val }));

  const makeBlankRow = useCallback(() => {
    const r: Record<string, any> = { _id: crypto.randomUUID(), _saved: false };
    rowFields.forEach((f) => { r[f.key] = ""; });
    return r;
  }, [rowFields]);

  const [rows, setRows] = useState<Record<string, any>[]>(() => [makeBlankRow()]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["qm-forms", endpoint, millId, header.date],
    queryFn: async () => {
      const p = new URLSearchParams({ page_size: "200" });
      if (header.date) p.set("date", header.date);
      const res = await api.get(`/api/v1${endpoint}?${p}`);
      return (res.data?.data ?? res.data) as any[];
    },
    enabled: !!millId,
    staleTime: 30_000,
  });

  const allRows = useMemo(() => {
    const saved = (existing ?? []).map((r: any) => ({ ...r, _saved: true, _id: r.id }));
    return [...saved, ...rows];
  }, [existing, rows]);

  const setRowField = (rowId: string, key: string, val: string) =>
    setRows((prev) => prev.map((r) => (r._id === rowId ? { ...r, [key]: val } : r)));

  const saveRow = async (row: Record<string, any>) => {
    setSavingId(row._id);
    try {
      const payload: Record<string, any> = { ...header };
      rowFields.forEach((f) => { payload[f.key] = parseVal(row[f.key], f.type); });
      if (row._saved && row.id) {
        await api.patch(`/api/v1${endpoint}/${row.id}`, payload);
      } else {
        await api.post(`/api/v1${endpoint}`, payload);
        setRows((prev) => prev.filter((r) => r._id !== row._id));
        setRows((prev) => [...prev, makeBlankRow()]);
      }
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? "Failed to save");
    } finally {
      setSavingId(null);
    }
  };

  const deleteRow = async (row: Record<string, any>) => {
    if (!row._saved) { setRows((prev) => prev.filter((r) => r._id !== row._id)); return; }
    try {
      await api.delete(`/api/v1${endpoint}/${row.id}`);
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["qm-forms", endpoint] });
    } catch { toast.error("Failed to delete"); }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number, row: Record<string, any>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (colIdx === rowFields.length - 1) saveRow(row);
      else tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx}-${colIdx + 1}"]`)?.focus();
    }
    if (e.key === "ArrowDown") { e.preventDefault(); tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx + 1}-${colIdx}"]`)?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); tableRef.current?.querySelector<HTMLInputElement>(`[data-cell="${rowIdx - 1}-${colIdx}"]`)?.focus(); }
  };

  return (
    <Card>
      {/* Shared header — locked fields */}
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-sm font-medium mr-2">{title}</CardTitle>
          {headerFields.map((f) => (
            <div key={f.key} className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">{f.label}</span>
              {f.type === "shift" ? (
                <CellSelect
                  value={String(header[f.key] ?? "A")}
                  onChange={(v) => setHeaderField(f.key, v)}
                  options={SHIFT_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              ) : (
                <input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  step={f.step}
                  value={header[f.key] ?? ""}
                  onChange={(e) => setHeaderField(f.key, e.target.value)}
                  placeholder={f.label}
                  className="h-7 text-xs border border-border rounded px-2 w-20 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
          {canEdit && (
            <button
              onClick={() => setRows((prev) => [...prev, makeBlankRow()])}
              className="ml-auto flex items-center gap-1 h-7 px-2 text-xs border border-border rounded hover:bg-muted text-foreground"
            >
              <Plus className="size-3" /> Add machine
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div ref={tableRef} className="overflow-x-auto">
          {isLoading ? (
            <div className="p-4 text-xs text-muted-foreground">Loading…</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="text-left text-[10px] font-medium text-muted-foreground px-2 py-1.5 w-6">#</th>
                  {rowFields.map((f) => (
                    <th key={f.key} className="text-left text-[10px] font-medium text-muted-foreground px-1 py-1.5 whitespace-nowrap">{f.label}</th>
                  ))}
                  {canEdit && <th className="w-16"></th>}
                </tr>
              </thead>
              <tbody>
                {allRows.length === 0 && (
                  <tr><td colSpan={rowFields.length + 2} className="text-center text-muted-foreground py-6 text-xs">Click "Add machine" to start entry</td></tr>
                )}
                {allRows.map((row, rowIdx) => (
                  <tr key={row._id ?? row.id} className={["border-b border-border/60", !row._saved ? "bg-primary/5" : "hover:bg-muted/30"].join(" ")}>
                    <td className="px-2 py-1 text-[10px] text-muted-foreground">{rowIdx + 1}</td>
                    {rowFields.map((field, colIdx) => (
                      <td key={field.key} className="px-1 py-1">
                        {field.type === "shift" ? (
                          <CellSelect
                            value={String(row[field.key] ?? "A")}
                            onChange={(v) => row._saved ? null : setRowField(row._id, field.key, v)}
                            options={SHIFT_OPTIONS.map((o) => ({ value: o, label: o }))}
                          />
                        ) : field.type === "yn" ? (
                          <CellSelect
                            value={row[field.key] === true || row[field.key] === "true" ? "true" : row[field.key] === false || row[field.key] === "false" ? "false" : ""}
                            onChange={(v) => row._saved ? null : setRowField(row._id, field.key, v)}
                            options={[{ value: "", label: "—" }, { value: "true", label: "OK" }, { value: "false", label: "NG" }]}
                          />
                        ) : (
                          <CellInput
                            value={row[field.key]}
                            onChange={(v) => setRowField(row._id, field.key, v)}
                            type={field.type === "number" ? "number" : "text"}
                            step={field.step}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx, row)}
                            inputRef={(el: any) => { if (el) el.setAttribute("data-cell", `${rowIdx}-${colIdx}`); }}
                          />
                        )}
                      </td>
                    ))}
                    {canEdit && (
                      <td className="px-1 py-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => saveRow(row)}
                            disabled={savingId === row._id}
                            className="h-6 px-1.5 text-[10px] rounded border border-emerald-400 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 disabled:opacity-50"
                          >
                            {savingId === row._id ? "…" : <Save className="size-3" />}
                          </button>
                          <button
                            onClick={() => deleteRow(row)}
                            className="h-6 px-1.5 rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex gap-4 px-3 py-1.5 border-t border-border/40 bg-muted/20">
          <span className="text-[10px] text-muted-foreground">
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Tab</kbd> next cell &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">Enter</kbd> save row &nbsp;
            <kbd className="text-[9px] bg-muted border border-border rounded px-1">↓↑</kbd> move rows &nbsp;
            <span className="text-muted-foreground/60">Shared date/shift/lot applies to all rows</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QmFormsTab — dispatcher: picks the right pattern per layout prop
// ═══════════════════════════════════════════════════════════════════════════

interface QmFormsTabProps {
  title: string;
  endpoint: string;
  columns: any[];
  millId: string | null | undefined;
  canEdit: boolean;
  layout?: QmLayout;
  // sheet-specific
  hasSide?: boolean;
  hasProcess?: boolean;
  hasTime?: boolean;
  hankField?: "std_hank" | "nominal_hank";
  readingLabel?: string;
}

function QmFormsTab({
  title, endpoint, columns, millId, canEdit, layout = "grid",
  hasSide, hasProcess, hasTime, hankField, readingLabel,
}: QmFormsTabProps) {
  const props = { title, endpoint, columns, millId, canEdit };
  if (layout === "sheet") return (
    <QmSheetEntry {...props}
      hasSide={hasSide}
      hasProcess={hasProcess}
      hasTime={hasTime ?? true}
      hankField={hankField ?? "std_hank"}
      readingLabel={readingLabel ?? "g"}
    />
  );
  if (layout === "reading") return <QmReadingEntry {...props} />;
  if (layout === "rows") return <QmRowsEntry {...props} />;
  return <QmGridEntry {...props} />;
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

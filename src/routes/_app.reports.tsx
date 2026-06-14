import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { reportsApi, productionApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";
import { useActiveMill } from "@/hooks/useActiveMill";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  FileText,
  TrendingUp,
  FlaskConical,
  Truck,
  IndianRupee,
  ArrowUpFromLine,
  Loader2,
  BarChart2,
  Trash2,
  Boxes,
  Users2,
} from "lucide-react";
import { exportApi } from "@/lib/api-service";
import { useState, useMemo } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { ExportMenu } from "@/components/ui/ExportMenu";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — SpinFlow ERP" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const user = useAuth((s) => s.user);
  const query = useQuery({
    queryKey: ["report-data"],
    queryFn: reportsApi.getSummary,
    staleTime: 60_000,
    retry: 1,
  });
  const { data } = query;
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExport = async (type: string, fn: () => Promise<void>) => {
    setExporting(type);
    try {
      await fn();
      toast.success(`${type} exported`);
    } catch {
      toast.error(`Failed to export ${type}`);
    } finally {
      setExporting(null);
    }
  };

  if (!user) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );

  if (query.isLoading)
    return (
      <>
        <Topbar title="Reports & Analytics" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );

  if (
    query.isError ||
    !data?.productionSummary ||
    !data?.qualitySummary ||
    !data?.dispatchSummary ||
    !data?.financialSummary
  )
    return (
      <>
        <Topbar title="Reports & Analytics" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">
          Failed to load report data. Please refresh.
        </div>
      </>
    );

  const prod = data.productionSummary;
  const qual = data.qualitySummary;
  const disp = data.dispatchSummary;
  const fin = data.financialSummary;
  const hr = data.hrSummary ?? { total_employees: 0, present_today: 0, pending_leaves: 0 };
  const stock = data.stockSummary ?? { total_lots: 0, sellable_stock_kg: 0 };

  const summaryData = [
    {
      name: "Production",
      value: prod.totalProduced ?? 0,
      target: prod.totalTarget ?? 0,
      unit: "kg",
    },
    { name: "Efficiency", value: prod.avgEfficiency ?? 0, target: 85, unit: "%" },
    { name: "Pass Rate", value: qual.passRate ?? 0, target: 95, unit: "%" },
    { name: "Waste", value: prod.wastePercent ?? 0, target: 3, unit: "%" },
  ];

  return (
    <>
      <AccessGuard module="reports">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold">Reports & Analytics</h1>
              <p className="text-sm text-muted-foreground">Cross-module performance reports, KPIs & exportable summaries</p>
            </div>
          </div>

          <Tabs defaultValue="summary">
            <TabsList className="mb-4">
              <TabsTrigger value="summary" className="gap-1.5">
                <BarChart2 className="size-3.5" /> Summary
              </TabsTrigger>
              <TabsTrigger value="records" className="gap-1.5">
                <FileText className="size-3.5" /> Production Records
              </TabsTrigger>
            </TabsList>

            <TabsContent value="records">
              <ProductionRecordsTab />
            </TabsContent>

            <TabsContent value="summary">
          <div className="space-y-6">
          <div className="flex items-center justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("Production PDF", () => exportApi.productionPdf())}
                disabled={exporting !== null}
              >
                {exporting === "Production PDF" ? (
                  <Loader2 className="size-3 animate-spin mr-1" />
                ) : (
                  <ArrowUpFromLine className="size-3 mr-1" />
                )}
                Prod PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("Production XLSX", () => exportApi.productionXlsx())}
                disabled={exporting !== null}
              >
                {exporting === "Production XLSX" ? (
                  <Loader2 className="size-3 animate-spin mr-1" />
                ) : (
                  <ArrowUpFromLine className="size-3 mr-1" />
                )}
                Prod XLSX
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleExport("Dispatch PDF", () => exportApi.dispatchPdf())}
                disabled={exporting !== null}
              >
                {exporting === "Dispatch PDF" ? (
                  <Loader2 className="size-3 animate-spin mr-1" />
                ) : (
                  <ArrowUpFromLine className="size-3 mr-1" />
                )}
                Dispatch PDF
              </Button>
            </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Production
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary" />
                  {((prod.totalProduced ?? 0) / 1000).toFixed(1)}T
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  vs {((prod.totalTarget ?? 0) / 1000).toFixed(1)}T target
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Quality</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <FlaskConical className="size-5 text-success" />
                  {qual.passRate ?? 0}% pass
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {qual.testsConducted ?? 0} tests conducted
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Dispatch</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Truck className="size-5 text-primary" />
                  {disp.delivered ?? 0} delivered
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {disp.pending ?? 0} pending · {disp.inTransit ?? 0} in transit
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Financial</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <IndianRupee className="size-5 text-primary" />₹
                  {((fin.salesTotal ?? 0) / 10000000).toFixed(2)}Cr
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  GST: ₹{((fin.gstCollected ?? 0) / 100000).toFixed(2)}L
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Module KPIs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[640px] w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Metric</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryData.map((row) => (
                        <TableRow key={row.name}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">
                            {row.value}
                            {row.unit !== "%" ? ` ${row.unit}` : "%"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {row.target}
                            {row.unit !== "%" ? ` ${row.unit}` : "%"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.value >= row.target ? "default" : "destructive"}>
                              {row.value >= row.target ? "On Track" : "Below Target"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Key Metrics Comparison</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summaryData} layout="vertical" margin={{ left: 80 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      horizontal={false}
                    />
                    <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke="var(--color-muted-foreground)"
                      fontSize={12}
                      width={70}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar
                      dataKey="value"
                      fill="var(--color-primary)"
                      radius={[0, 4, 4, 0]}
                      name="Actual"
                    />
                    <Bar
                      dataKey="target"
                      fill="var(--color-muted-foreground)"
                      radius={[0, 4, 4, 0]}
                      name="Target"
                      opacity={0.5}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Sales (Total)
                  </div>
                  <div className="text-xl font-semibold mt-1">
                    ₹{((fin.salesTotal ?? 0) / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Purchases
                  </div>
                  <div className="text-xl font-semibold mt-1">
                    ₹{((fin.purchaseTotal ?? 0) / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Receivables
                  </div>
                  <div className="text-xl font-semibold mt-1 text-destructive">
                    ₹{((fin.receivablesOutstanding ?? 0) / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    GST Collected
                  </div>
                  <div className="text-xl font-semibold mt-1">
                    ₹{((fin.gstCollected ?? 0) / 100000).toFixed(2)}L
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">HR Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-3">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-semibold">{hr.total_employees}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Employees</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-semibold text-green-600">{hr.present_today}</div>
                  <div className="text-xs text-muted-foreground mt-1">Present Today</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-semibold text-yellow-600">{hr.pending_leaves}</div>
                  <div className="text-xs text-muted-foreground mt-1">Pending Leaves</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stock Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2">
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-semibold">{stock.total_lots}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Lots</div>
                </div>
                <div className="rounded-lg border p-4 text-center">
                  <div className="text-2xl font-semibold">{(stock.sellable_stock_kg ?? 0).toLocaleString()} kg</div>
                  <div className="text-xs text-muted-foreground mt-1">Sellable Stock</div>
                </div>
              </div>
            </CardContent>
          </Card>
          </div>{/* end summary space-y-6 */}
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTION RECORDS TAB
// ─────────────────────────────────────────────────────────────────────────────

type RecordType = "entries" | "wastage" | "packing" | "manpower";

const RECORD_TYPES: { value: RecordType; label: string; icon: React.ElementType }[] = [
  { value: "entries",  label: "Shift Entries",  icon: TrendingUp },
  { value: "wastage",  label: "Wastage",         icon: Trash2 },
  { value: "packing",  label: "Packing",         icon: Boxes },
  { value: "manpower", label: "Manpower",        icon: Users2 },
];

function ProductionRecordsTab() {
  const { millId } = useActiveMill();
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400_000);
  const defaultFrom = new Date(thirtyDaysAgo.getTime() - thirtyDaysAgo.getTimezoneOffset() * 60000).toISOString().split("T")[0];

  const [recordType, setRecordType] = useState<RecordType>("entries");
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo]     = useState(localDate);
  const [shift, setShift]       = useState<string>("_all");
  const [department, setDepartment] = useState<string>("");

  // Load data based on record type
  const wasteQ = useQuery({
    queryKey: ["report-waste", millId, dateFrom, dateTo, shift, department],
    queryFn: () => productionApi.getWasteEntries({
      mill_id: millId,
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo   ? { date_to: dateTo }     : {}),
      ...(shift !== "_all" ? { shift } : {}),
      ...(department ? { department } : {}),
      page_size: 500,
    }),
    enabled: !!millId && recordType === "wastage",
    staleTime: 30_000,
  });

  const packingQ = useQuery({
    queryKey: ["report-packing", millId, dateFrom, dateTo, shift],
    queryFn: async () => {
      const { api } = await import("@/lib/api");
      const r = await api.get("/production/packing/entries", {
        params: {
          mill_id: millId,
          ...(dateFrom ? { date: dateFrom } : {}),
          ...(shift !== "_all" ? { shift } : {}),
          page_size: 500,
        },
      });
      return r.data;
    },
    enabled: !!millId && recordType === "packing",
    staleTime: 30_000,
  });

  const manpowerQ = useQuery({
    queryKey: ["report-manpower", millId, dateFrom, shift],
    queryFn: () => productionApi.getRFManpower({
      mill_id: millId,
      ...(dateFrom ? { date: dateFrom } : {}),
      ...(shift !== "_all" ? { shift } : {}),
    }),
    enabled: !!millId && recordType === "manpower",
    staleTime: 30_000,
  });

  const wasteRows  = (wasteQ.data?.data   ?? []) as any[];
  const packingRows = (packingQ.data?.data ?? []) as any[];
  const manpowerRows = (manpowerQ.data?.data ?? []) as any[];

  const isLoading = (recordType === "wastage" && wasteQ.isLoading)
    || (recordType === "packing"  && packingQ.isLoading)
    || (recordType === "manpower" && manpowerQ.isLoading);

  // Column configs per record type
  const colConfig: Record<RecordType, { key: string; label: string }[]> = {
    entries: [],
    wastage: [
      { key: "date", label: "Date" },
      { key: "shift", label: "Shift" },
      { key: "department", label: "Dept" },
      { key: "machine_code", label: "Machine" },
      { key: "waste_type", label: "Waste Type" },
      { key: "waste_kg", label: "Waste (kg)" },
      { key: "lot_no", label: "Lot" },
      { key: "ratio", label: "Ratio" },
      { key: "status", label: "Status" },
      { key: "entered_by", label: "By" },
    ],
    packing: [
      { key: "date", label: "Date" },
      { key: "shift", label: "Shift" },
      { key: "lot_no", label: "Lot No" },
      { key: "count_ne", label: "Count Ne" },
      { key: "count_desc", label: "Count Desc" },
      { key: "bag_from", label: "Bag From" },
      { key: "bag_to", label: "Bag To" },
      { key: "total_bags", label: "Total Bags" },
      { key: "operator", label: "Operator" },
    ],
    manpower: [
      { key: "date", label: "Date" },
      { key: "shift", label: "Shift" },
      { key: "category", label: "Category" },
      { key: "mc_id_from", label: "MC From" },
      { key: "mc_id_to", label: "MC To" },
      { key: "total_machines", label: "Machines" },
      { key: "headcount", label: "Headcount" },
      { key: "supervisor", label: "Supervisor" },
    ],
  };

  const activeRows = recordType === "wastage" ? wasteRows
    : recordType === "packing" ? packingRows
    : recordType === "manpower" ? manpowerRows
    : [];

  const cols = colConfig[recordType];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Record Type</Label>
              <div className="flex gap-1">
                {RECORD_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    onClick={() => setRecordType(rt.value)}
                    className={[
                      "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                      recordType === rt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:border-primary/50",
                    ].join(" ")}
                  >
                    <rt.icon className="size-3" />
                    {rt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Shift</Label>
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All Shifts</SelectItem>
                  <SelectItem value="A">A — Morning</SelectItem>
                  <SelectItem value="B">B — Afternoon</SelectItem>
                  <SelectItem value="C">C — Night</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recordType === "wastage" && (
              <div className="space-y-1">
                <Label className="text-xs">Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. Ring Frame" className="h-8 text-xs w-36" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm">
            {RECORD_TYPES.find((r) => r.value === recordType)?.label} Records
            {!isLoading && activeRows.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({activeRows.length} rows)</span>
            )}
          </CardTitle>
          {activeRows.length > 0 && cols.length > 0 && (
            <ExportMenu
              filename={`${recordType}_report_${dateFrom}_${dateTo}`}
              title={`${RECORD_TYPES.find((r) => r.value === recordType)?.label} Report`}
              subtitle={`${dateFrom} to ${dateTo}${shift !== "_all" ? `  Shift: ${shift}` : ""}`}
              columns={cols}
              rows={activeRows}
            />
          )}
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : recordType === "entries" ? (
            <div className="p-6 text-sm text-muted-foreground">
              Use the Shift Entries Log tab on the Production page for detailed shift entry records.
            </div>
          ) : activeRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="text-xs min-w-max">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    {cols.map((c) => (
                      <TableHead key={c.key} className="px-3 py-2 whitespace-nowrap">{c.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeRows.map((row: any, i: number) => (
                    <TableRow key={row.id ?? i}>
                      {cols.map((c) => (
                        <TableCell key={c.key} className="px-3 py-1.5 whitespace-nowrap">
                          {row[c.key] != null && row[c.key] !== "" ? String(row[c.key]) : "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

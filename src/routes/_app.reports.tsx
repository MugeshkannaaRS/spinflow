import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  FileText,
  TrendingUp,
  FlaskConical,
  Truck,
  IndianRupee,
  ArrowUpFromLine,
  Loader2,
} from "lucide-react";
import { exportApi } from "@/lib/api-service";
import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { toast } from "sonner";

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

  if (!user) return null;

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
            <div className="flex items-center gap-1">
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
        </div>
      </AccessGuard>
    </>
  );
}

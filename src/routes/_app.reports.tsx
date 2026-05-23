import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { reportsApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
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
  Download,
  Loader2,
} from "lucide-react";
import { exportApi } from "@/lib/api-service";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({ meta: [{ title: "Reports — SpinFlow ERP" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const user = useAuth((s) => s.user)!;
  const { data } = useQuery({
    queryKey: ["report-data"],
    queryFn: reportsApi.getSummary,
    staleTime: 60_000,
    retry: 1,
  });
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

  if (!data) return null;

  const summaryData = [
    {
      name: "Production",
      value: data.productionSummary.totalProduced,
      target: data.productionSummary.totalTarget,
      unit: "kg",
    },
    { name: "Efficiency", value: data.productionSummary.avgEfficiency, target: 85, unit: "%" },
    { name: "Pass Rate", value: data.qualitySummary.passRate, target: 95, unit: "%" },
    { name: "Waste", value: data.productionSummary.wastePercent, target: 3, unit: "%" },
  ];

  return (
    <>
      <Topbar
        title="Reports & Analytics"
        subtitle="Cross-module performance reports, KPIs & exportable summaries"
      >
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
              <Download className="size-3 mr-1" />
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
              <Download className="size-3 mr-1" />
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
              <Download className="size-3 mr-1" />
            )}
            Dispatch PDF
          </Button>
        </div>
      </Topbar>
      <AccessGuard module="reports">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Production
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <TrendingUp className="size-5 text-primary" />
                  {(data.productionSummary.totalProduced / 1000).toFixed(1)}T
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  vs {(data.productionSummary.totalTarget / 1000).toFixed(1)}T target
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Quality</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <FlaskConical className="size-5 text-success" />
                  {data.qualitySummary.passRate}% pass
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.qualitySummary.testsConducted} tests conducted
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Dispatch</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Truck className="size-5 text-primary" />
                  {data.dispatchSummary.delivered} delivered
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {data.dispatchSummary.pending} pending · {data.dispatchSummary.inTransit} in
                  transit
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Financial</div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <IndianRupee className="size-5 text-primary" />₹
                  {(data.financialSummary.salesTotal / 10000000).toFixed(2)}Cr
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  GST: ₹{(data.financialSummary.gstCollected / 100000).toFixed(2)}L
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
                    ₹{(data.financialSummary.salesTotal / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Purchases
                  </div>
                  <div className="text-xl font-semibold mt-1">
                    ₹{(data.financialSummary.purchaseTotal / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    Receivables
                  </div>
                  <div className="text-xl font-semibold mt-1 text-destructive">
                    ₹{(data.financialSummary.receivablesOutstanding / 100000).toFixed(2)}L
                  </div>
                </div>
                <div className="rounded-lg border p-4">
                  <div className="text-xs text-muted-foreground uppercase font-medium">
                    GST Collected
                  </div>
                  <div className="text-xl font-semibold mt-1">
                    ₹{(data.financialSummary.gstCollected / 100000).toFixed(2)}L
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </AccessGuard>
    </>
  );
}

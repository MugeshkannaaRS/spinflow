import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { accountsApi, financeApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import {
  Receipt,
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({ meta: [{ title: "Accounts — SpinFlow ERP" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const user = useAuth((s) => s.user);
  const invQ = useQuery({
    queryKey: ["invoices"],
    queryFn: accountsApi.getInvoices,
    staleTime: 60_000,
    retry: 1,
  });
  const recvQ = useQuery({
    queryKey: ["receivables"],
    queryFn: accountsApi.getReceivables,
    staleTime: 60_000,
    retry: 1,
  });

  const invoices: any[] = invQ.data ?? [];
  const receivables: any[] = recvQ.data ?? [];

  const [filteredInvoices, setFilteredInvoices] = useState<any[]>([]);
  const [filteredReceivables, setFilteredReceivables] = useState<any[]>([]);

  useEffect(() => {
    setFilteredInvoices(invQ.data ?? []);
  }, [invQ.data]);
  useEffect(() => {
    setFilteredReceivables(recvQ.data ?? []);
  }, [recvQ.data]);

  const totalSales = invoices
    .filter((i) => i.type === "sales")
    .reduce((s, i) => s + (i.total ?? 0), 0);
  const totalPurchases = invoices
    .filter((i) => i.type === "purchase")
    .reduce((s, i) => s + (i.total ?? 0), 0);
  const outstandingTotal = (receivables as any[]).reduce((s, r) => s + (r.outstanding ?? 0), 0);
  const overdueCount = (receivables as any[]).filter((r) => r.status === "overdue").length;

  if (!user) return null;

  if (invQ.isLoading)
    return (
      <>
        <Topbar title="Accounts" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (invQ.isError)
    return (
      <>
        <Topbar title="Accounts" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Accounts"
        subtitle="GST invoices, sales/purchase register, outstanding tracking & Tally export"
      />
      <AccessGuard module="accounts">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Sales
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <IndianRupee className="size-5 text-primary" />₹{(totalSales / 100000).toFixed(2)}{" "}
                  L
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Purchases
                </div>
                <div className="text-2xl font-semibold mt-2">
                  ₹{(totalPurchases / 100000).toFixed(2)} L
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Outstanding
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />₹
                  {(outstandingTotal / 100000).toFixed(2)} L
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Overdue Invoices
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  {overdueCount}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="invoices">
            <TabsList>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="receivables">Receivables</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
            </TabsList>

            <TabsContent value="invoices">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">GST Invoices</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={invoices}
                    onFilter={setFilteredInvoices}
                    columns={[
                      {
                        key: "invoiceNo" as const,
                        label: "Invoice No",
                        placeholder: "Filter invoice...",
                      },
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      {
                        key: "customer" as const,
                        label: "Customer / Supplier",
                        placeholder: "Filter customer...",
                      },
                      { key: "type" as const, label: "Type", placeholder: "Filter type..." },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Customer / Supplier</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">GST</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                            <TableCell className="text-sm">{inv.date}</TableCell>
                            <TableCell className="font-medium">{inv.customer}</TableCell>
                            <TableCell>
                              <Badge variant={inv.type === "sales" ? "default" : "secondary"}>
                                {inv.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{(inv.amount ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              ₹{(inv.gst ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ₹{(inv.total ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  inv.status === "paid"
                                    ? "default"
                                    : inv.status === "overdue"
                                      ? "destructive"
                                      : inv.status === "posted"
                                        ? "secondary"
                                        : "outline"
                                }
                              >
                                {inv.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receivables">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Outstanding Receivables</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={receivables as any[]}
                    onFilter={setFilteredReceivables}
                    columns={[
                      {
                        key: "customer" as const,
                        label: "Customer",
                        placeholder: "Filter customer...",
                      },
                      {
                        key: "invoiceNo" as const,
                        label: "Invoice",
                        placeholder: "Filter invoice...",
                      },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Days Overdue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredReceivables.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.customer}</TableCell>
                            <TableCell className="font-mono text-xs">{r.invoiceNo}</TableCell>
                            <TableCell className="text-sm">{r.date}</TableCell>
                            <TableCell className="text-sm">{r.dueDate}</TableCell>
                            <TableCell className="text-right">
                              ₹{(r.amount ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium text-destructive">
                              ₹{(r.outstanding ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  r.status === "paid"
                                    ? "default"
                                    : r.status === "overdue"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {r.status === "paid" && <CheckCircle2 className="size-3 mr-1" />}
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {r.daysOverdue > 0 ? (
                                <span className="text-destructive font-medium">
                                  {r.daysOverdue}d
                                </span>
                              ) : (
                                "—"
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

            <TabsContent value="finance">
              <FinanceTab millId={user.millId} />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function FinanceTab({ millId }: { millId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const plQ = useQuery({
    queryKey: ["pl", millId, month, year],
    queryFn: () => financeApi.getPL(millId, Number(month), Number(year)),
    staleTime: 60_000,
    retry: 1,
  });
  const ageingQ = useQuery({
    queryKey: ["receivables-ageing", millId],
    queryFn: () => financeApi.getReceivables(millId),
    staleTime: 60_000,
    retry: 1,
  });
  const gstQ = useQuery({
    queryKey: ["gst", millId, month, year],
    queryFn: () => financeApi.getGST(millId, Number(month), Number(year)),
    staleTime: 60_000,
    retry: 1,
  });

  const pl = plQ.data;
  const ageing = ageingQ.data;
  const gst = gstQ.data;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label>Month</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((n, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* P&L */}
      {pl && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Profit & Loss — {months[Number(month) - 1]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Revenue</div>
                  <div className="text-xl font-semibold">₹{(pl.revenue / 100000).toFixed(2)} L</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">COGS</div>
                  <div className="text-xl font-semibold">₹{(pl.cogs / 100000).toFixed(2)} L</div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Gross Profit</div>
                  <div
                    className={`text-xl font-semibold flex items-center gap-1 ${pl.gross_profit >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {pl.gross_profit >= 0 ? (
                      <TrendingUp className="size-4" />
                    ) : (
                      <TrendingDown className="size-4" />
                    )}
                    ₹{(pl.gross_profit / 100000).toFixed(2)} L
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Margin: {pl.gross_margin_pct}%
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="text-xs text-muted-foreground">Net Profit</div>
                  <div
                    className={`text-xl font-semibold flex items-center gap-1 ${pl.net_profit >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {pl.net_profit >= 0 ? (
                      <TrendingUp className="size-4" />
                    ) : (
                      <TrendingDown className="size-4" />
                    )}
                    ₹{(pl.net_profit / 100000).toFixed(2)} L
                  </div>
                  <div className="text-xs text-muted-foreground">Margin: {pl.net_margin_pct}%</div>
                </div>
              </div>
              <div className="mt-4 h-24 flex items-end gap-4">
                {[
                  { label: "Revenue", val: pl.revenue, color: "bg-blue-500" },
                  { label: "COGS", val: pl.cogs, color: "bg-orange-500" },
                  {
                    label: "Net Profit",
                    val: pl.net_profit,
                    color: pl.net_profit >= 0 ? "bg-green-500" : "bg-red-500",
                  },
                ].map((b) => {
                  const maxVal = Math.max(pl.revenue, 1);
                  const h = Math.max((b.val / maxVal) * 100, 4);
                  return (
                    <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-xs text-muted-foreground">
                        ₹{(b.val / 100000).toFixed(1)}L
                      </div>
                      <div
                        className={`w-full rounded ${b.color}`}
                        style={{ height: `${h}px`, minHeight: 8 }}
                      />
                      <div className="text-xs font-medium">{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Receivables Ageing */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Receivables Ageing</CardTitle>
            </CardHeader>
            <CardContent>
              {ageing ? (
                <div className="space-y-4">
                  <div className="text-3xl font-bold">
                    ₹{(ageing.total_outstanding / 100000).toFixed(2)} L
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {ageing.invoice_count} invoices · Oldest: {ageing.oldest_invoice_days} days
                  </div>
                  <div className="flex h-8 rounded-full overflow-hidden">
                    {[
                      { label: "0-30d", val: ageing.buckets.current, color: "bg-green-500" },
                      { label: "31-60d", val: ageing.buckets.days_31_60, color: "bg-yellow-500" },
                      { label: "61-90d", val: ageing.buckets.days_61_90, color: "bg-orange-500" },
                      { label: "90+", val: ageing.buckets.over_90, color: "bg-red-500" },
                    ].map((b) => {
                      const total = ageing.total_outstanding || 1;
                      const pct = Math.max((b.val / total) * 100, b.val > 0 ? 2 : 0);
                      return (
                        <div
                          key={b.label}
                          className={`${b.color}`}
                          style={{ width: `${pct}%` }}
                          title={`${b.label}: ₹${b.val.toLocaleString()}`}
                        />
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    {[
                      {
                        label: "Current (0-30d)",
                        val: ageing.buckets.current,
                        color: "text-green-600",
                      },
                      {
                        label: "31-60 days",
                        val: ageing.buckets.days_31_60,
                        color: "text-yellow-600",
                      },
                      {
                        label: "61-90 days",
                        val: ageing.buckets.days_61_90,
                        color: "text-orange-600",
                      },
                      { label: "Over 90 days", val: ageing.buckets.over_90, color: "text-red-600" },
                    ].map((b) => (
                      <div key={b.label} className={b.color}>
                        <div className="font-medium">{b.label}</div>
                        <div>₹{(b.val / 100000).toFixed(2)} L</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
            </CardContent>
          </Card>

          {/* GST Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                GST Summary — {months[Number(month) - 1]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gst ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Output GST</div>
                    <div className="text-lg font-semibold">
                      ₹{(gst.output_gst.total / 100000).toFixed(2)} L
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      CGST: ₹{gst.output_gst.cgst.toFixed(0)} · SGST: ₹
                      {gst.output_gst.sgst.toFixed(0)}
                      {gst.output_gst.igst > 0 && ` · IGST: ₹${gst.output_gst.igst.toFixed(0)}`}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Input GST</div>
                    <div className="text-lg font-semibold">
                      ₹{(gst.input_gst.total / 100000).toFixed(2)} L
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <div className="text-xs text-muted-foreground">Net Payable</div>
                    <div
                      className={`text-lg font-semibold ${gst.net_payable > 0 ? "text-destructive" : "text-green-600"}`}
                    >
                      ₹{(gst.net_payable / 100000).toFixed(2)} L
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

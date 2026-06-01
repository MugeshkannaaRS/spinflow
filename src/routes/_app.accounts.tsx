import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { accountsApi, financeApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetFooter,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useState } from "react";
import {
  Receipt,
  IndianRupee,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/accounts")({
  head: () => ({ meta: [{ title: "Accounts — SpinFlow ERP" }] }),
  component: AccountsPage,
});

function AccountsPage() {
  const user = useAuth((s) => s.user);
  const { millId } = useActiveMill();
  const invColConfig = useColumnConfig("accounts_invoices");
  const recvColConfig = useColumnConfig("accounts_receivables");
  const invQ = useQuery({
    queryKey: ["invoices", millId],
    queryFn: accountsApi.getInvoices,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const recvQ = useQuery({
    queryKey: ["receivables", millId],
    queryFn: accountsApi.getReceivables,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const invoices: any[] = invQ.data ?? [];
  const receivables: any[] = recvQ.data ?? [];

  const totalSales = invoices
    .filter((i) => i.type === "sales")
    .reduce((s, i) => s + (i.total ?? 0), 0);
  const totalPurchases = invoices
    .filter((i) => i.type === "purchase")
    .reduce((s, i) => s + (i.total ?? 0), 0);
  const outstandingTotal = (receivables as any[]).reduce((s, r) => s + (r.outstanding ?? 0), 0);
  const overdueCount = (receivables as any[]).filter((r) => r.status === "overdue").length;
  const qc = useQueryClient();
  const [invSlideOpen, setInvSlideOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<any>(null);

  const deleteM = useMutation({
    mutationFn: (id: string) => accountsApi.deleteInvoice(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success("Invoice deleted");
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to delete invoice");
    },
  });

  const handleEdit = (inv: any) => { setEditingInv(inv); setInvSlideOpen(true); };
  const handleNew = () => { setEditingInv(null); setInvSlideOpen(true); };
  const handleDelete = (inv: any) => {
    if (window.confirm(`Delete invoice ${inv.invoiceNo ?? ""}?`)) deleteM.mutate(inv.id);
  };

  if (!user) return null;

  if (invQ.isLoading)
    return (
      <>
        <PageHeader title="Accounts" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (invQ.isError)
    return (
      <>
        <PageHeader title="Accounts" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Accounts"
        subtitle="GST invoices, sales/purchase register, outstanding tracking & Tally export"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["invoices"] })}
        isRefreshing={invQ.isFetching}
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
                  <DataTable
                    tableId="accounts_invoices"
                    columns={[
                      { key: "invoiceNo", label: invColConfig.getLabel('invoice_no'), className: "font-mono text-xs" },
                      { key: "date", label: invColConfig.getLabel('date'), type: "date" },
                      { key: "customer", label: invColConfig.getLabel('customer'), render: (inv: any) => <span className="font-medium">{inv.customer}</span> },
                      { key: "type", label: invColConfig.getLabel('type'), type: "status", render: (inv: any) => <Badge variant={inv.type === "sales" ? "default" : "secondary"}>{inv.type}</Badge> },
                      { key: "amount", label: invColConfig.getLabel('amount'), render: (inv: any) => `₹${(inv.amount ?? 0).toLocaleString()}` },
                      { key: "gst", label: invColConfig.getLabel('gst'), render: (inv: any) => `₹${(inv.gst ?? 0).toLocaleString()}` },
                      { key: "total", label: invColConfig.getLabel('total'), render: (inv: any) => <span className="font-medium">₹{(inv.total ?? 0).toLocaleString()}</span> },
                      { key: "status", label: invColConfig.getLabel('status'), type: "status", render: (inv: any) => <Badge variant={inv.status === "paid" ? "default" : inv.status === "overdue" ? "destructive" : inv.status === "posted" ? "secondary" : "outline"}>{inv.status}</Badge> },
                    ] satisfies ColDef[]}
                    data={invoices}
                    loading={invQ.isLoading}
                    rowKey={(inv) => inv.id}
                    exportFilename="invoices"
                    toolbar={
                      <Button size="sm" className="h-8 text-xs gap-1" onClick={handleNew}>
                        <Plus className="size-3.5" /> New Invoice
                      </Button>
                    }
                    rowActions={(inv: any) => (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleEdit(inv)}>
                          <Pencil className="size-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => handleDelete(inv)}>
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    )}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="receivables">
              <Card>
                <CardHeader><CardTitle className="text-base">Outstanding Receivables</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="accounts_receivables"
                    columns={[
                      { key: "customer", label: recvColConfig.getLabel('customer'), render: (r: any) => <span className="font-medium">{r.customer}</span> },
                      { key: "invoiceNo", label: recvColConfig.getLabel('invoice_no'), className: "font-mono text-xs" },
                      { key: "date", label: recvColConfig.getLabel('date'), type: "date" },
                      { key: "dueDate", label: recvColConfig.getLabel('due_date'), type: "date" },
                      { key: "amount", label: recvColConfig.getLabel('amount'), render: (r: any) => `₹${(r.amount ?? 0).toLocaleString()}` },
                      { key: "outstanding", label: recvColConfig.getLabel('outstanding'), render: (r: any) => <span className="font-medium text-destructive">₹{(r.outstanding ?? 0).toLocaleString()}</span> },
                      { key: "status", label: recvColConfig.getLabel('status'), type: "status", render: (r: any) => <Badge variant={r.status === "paid" ? "default" : r.status === "overdue" ? "destructive" : "secondary"}>{r.status === "paid" && <CheckCircle2 className="size-3 mr-1 inline" />}{r.status}</Badge> },
                      { key: "daysOverdue", label: recvColConfig.getLabel('days_overdue'), render: (r: any) => r.daysOverdue > 0 ? <span className="text-destructive font-medium">{r.daysOverdue}d</span> : "—" },
                    ] satisfies ColDef[]}
                    data={receivables as any[]}
                    loading={recvQ.isLoading}
                    rowKey={(r) => r.id}
                    exportFilename="receivables"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="finance">
              <FinanceTab millId={user.millId ?? ""} />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
      <InvoiceSlideOver
        open={invSlideOpen}
        onOpenChange={(open) => { setInvSlideOpen(open); if (!open) setEditingInv(null); }}
        invoice={editingInv}
      />
    </>
  );
}

interface InvItem {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  amount: number;
}

function InvoiceSlideOver({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (v: boolean) => void; invoice?: any }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);

  const [customerName, setCustomerName] = useState(invoice?.customer ?? "");
  const [invoiceDate, setInvoiceDate] = useState(invoice?.date ?? today);
  const [invoiceType, setInvoiceType] = useState(invoice?.type ?? "sale");
  const [items, setItems] = useState<InvItem[]>(
    invoice?.items?.length > 0
      ? invoice.items.map((it: any) => ({
          description: it.description ?? "",
          hsn: it.hsn ?? "",
          qty: it.qty ?? 1,
          rate: it.rate ?? 0,
          amount: (it.qty ?? 1) * (it.rate ?? 0),
        }))
      : [{ description: "", hsn: "", qty: 1, rate: 0, amount: 0 }],
  );
  const [cgst, setCgst] = useState(invoice?.cgst ?? 0);
  const [sgst, setSgst] = useState(invoice?.sgst ?? 0);
  const [igst, setIgst] = useState(invoice?.igst ?? 0);
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? "");
  const [paymentStatus, setPaymentStatus] = useState(invoice?.status ?? "unpaid");
  const [notes, setNotes] = useState(invoice?.notes ?? "");

  const subTotal = items.reduce((s, it) => s + it.amount, 0);
  const total = subTotal + (cgst || 0) + (sgst || 0) + (igst || 0);

  const m = useMutation({
    mutationFn: (data: any) =>
      invoice ? accountsApi.updateInvoice(invoice.id, data) : accountsApi.createInvoice(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast.success(invoice ? "Invoice updated" : "Invoice created");
      onOpenChange(false);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      const msg = Array.isArray(detail) ? detail.map((e: any) => `${e.loc?.slice(-1)[0]}: ${e.msg}`).join(", ") : detail || err?.message || "Failed to save invoice";
      toast.error(msg);
    },
  });

  const addItem = () => setItems([...items, { description: "", hsn: "", qty: 1, rate: 0, amount: 0 }]);

  const removeItem = (idx: number) => {
    if (items.length > 1) setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx: number, field: keyof InvItem, value: string | number) => {
    setItems(
      items.map((it, i) => {
        if (i !== idx) return it;
        const updated = { ...it, [field]: field === "qty" || field === "rate" ? Number(value) : value };
        if (field === "qty") updated.amount = Number(value) * it.rate;
        else if (field === "rate") updated.amount = it.qty * Number(value);
        return updated;
      }),
    );
  };

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const canSubmit = customerName.trim() && invoiceDate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!customerName.trim()) errs.customerName = "Customer name is required";
    if (!invoiceDate) errs.invoiceDate = "Invoice date is required";
    if (items.length === 0 || items.every((it) => !it.description.trim())) errs.items = "Add at least one line item";
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;
    m.mutate({
      customer: customerName,
      date: invoiceDate,
      type: invoiceType,
      items: items.map((it) => ({
        description: it.description,
        hsn: it.hsn,
        qty: it.qty,
        rate: it.rate,
        amount: it.amount,
      })),
      sub_total: subTotal,
      cgst,
      sgst,
      igst,
      total,
      due_date: dueDate,
      status: paymentStatus,
      notes,
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{invoice ? "Edit Invoice" : "New Invoice"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-1">
            <Label>Customer Name *</Label>
            <Input value={customerName} onChange={(e) => { setCustomerName(e.target.value); setFormErrors((p) => ({ ...p, customerName: "" })); }} placeholder="Customer name" className={formErrors.customerName ? "border-destructive" : ""} />
            {formErrors.customerName && <p className="text-xs text-destructive">{formErrors.customerName}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Invoice Date *</Label>
              <Input type="date" value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); setFormErrors((p) => ({ ...p, invoiceDate: "" })); }} className={formErrors.invoiceDate ? "border-destructive" : ""} />
              {formErrors.invoiceDate && <p className="text-xs text-destructive">{formErrors.invoiceDate}</p>}
            </div>
            <div className="space-y-1">
              <Label>Invoice Type</Label>
              <Select value={invoiceType} onValueChange={setInvoiceType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="purchase">Purchase</SelectItem>
                  <SelectItem value="debit_note">Debit Note</SelectItem>
                  <SelectItem value="credit_note">Credit Note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-1.5 items-start">
                <Input
                  placeholder="Description *"
                  value={it.description}
                  onChange={(e) => updateItem(idx, "description", e.target.value)}
                  className="h-8 text-xs flex-1 min-w-0"
                />
                <Input
                  placeholder="HSN"
                  value={it.hsn}
                  onChange={(e) => updateItem(idx, "hsn", e.target.value)}
                  className="h-8 text-xs w-16 shrink-0"
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  value={it.qty}
                  onChange={(e) => updateItem(idx, "qty", e.target.value)}
                  className="h-8 text-xs w-16 shrink-0"
                />
                <Input
                  type="number"
                  placeholder="Rate"
                  value={it.rate}
                  onChange={(e) => updateItem(idx, "rate", e.target.value)}
                  className="h-8 text-xs w-20 shrink-0"
                />
                <div className="h-8 flex items-center text-xs font-medium tabular-nums w-20 shrink-0 justify-end">
                  ₹{it.amount.toFixed(2)}
                </div>
                <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="text-xs">
              <Plus className="size-3 mr-1" /> Add Item
            </Button>
          </div>

          <div className="flex justify-between text-sm font-medium border-t pt-2">
            <span>Sub Total</span>
            <span>₹{subTotal.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>CGST (₹)</Label>
              <Input type="number" value={cgst} onChange={(e) => setCgst(+e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>SGST (₹)</Label>
              <Input type="number" value={sgst} onChange={(e) => setSgst(+e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>IGST (₹)</Label>
              <Input type="number" value={igst} onChange={(e) => setIgst(+e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="flex justify-between text-sm font-semibold border-t pt-2">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label>Payment Status</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid" className="text-xs">Unpaid</SelectItem>
                  <SelectItem value="paid" className="text-xs">Paid</SelectItem>
                  <SelectItem value="partial" className="text-xs">Partial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className="text-xs" />
          </div>

          <SheetFooter className="pt-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" size="sm">Cancel</Button>
            </SheetClose>
            <Button type="submit" size="sm" disabled={!canSubmit || m.isPending}>
              {m.isPending ? "Saving..." : invoice ? "Update Invoice" : "Create Invoice"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FinanceTab({ millId }: { millId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));

  const enabled = !!millId;

  const plQ = useQuery({
    queryKey: ["pl", millId, month, year],
    queryFn: () => financeApi.getPL(millId, Number(month), Number(year)),
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
  const ageingQ = useQuery({
    queryKey: ["receivables-ageing", millId],
    queryFn: () => financeApi.getReceivables(millId),
    staleTime: 60_000,
    retry: 1,
    enabled,
  });
  const gstQ = useQuery({
    queryKey: ["gst", millId, month, year],
    queryFn: () => financeApi.getGST(millId, Number(month), Number(year)),
    staleTime: 60_000,
    retry: 1,
    enabled,
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
                          title={`${b.label}: ₹${(b.val ?? 0).toLocaleString()}`}
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

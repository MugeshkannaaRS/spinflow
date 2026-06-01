import * as XLSX from "xlsx";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseApi, baleApi, uploadApi } from "@/lib/api-service";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
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
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { ColumnConfigurator } from "@/components/ui/column-configurator";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  ShoppingCart,
  Users,
  ClipboardCheck,
  PackageOpen,
  Layers,
  FlaskConical,
  BarChart2,
  Download,
  CheckSquare,
  Square,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/purchase")({
  head: () => ({ meta: [{ title: "Cotton Purchase — SpinFlow ERP" }] }),
  component: PurchasePage,
});

function PurchasePage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "purchase");
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "MILL_OWNER";
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const suppliersQ = useQuery({
    queryKey: ["suppliers", millId],
    queryFn: purchaseApi.getSuppliers,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const purchasesQ = useQuery({
    queryKey: ["purchases", millId],
    queryFn: purchaseApi.getPurchases,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const grnsQ = useQuery({
    queryKey: ["grns", millId],
    queryFn: purchaseApi.getGRNs,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const suppliers: any[] = suppliersQ.data ?? [];
  const purchases: any[] = purchasesQ.data ?? [];
  const grns: any[] = grnsQ.data ?? [];

  const [purchaseFiltered, setPurchaseFiltered] = useState<any[]>([]);
  const [supplierFiltered, setSupplierFiltered] = useState<any[]>([]);
  const [grnFiltered, setGrnFiltered] = useState<any[]>([]);

  useEffect(() => {
    setPurchaseFiltered(purchasesQ.data ?? []);
  }, [purchasesQ.data]);
  useEffect(() => {
    setSupplierFiltered(suppliersQ.data ?? []);
  }, [suppliersQ.data]);
  useEffect(() => {
    setGrnFiltered(grnsQ.data ?? []);
  }, [grnsQ.data]);

  const activeSuppliers = suppliers.filter((s) => s.status === "active").length;
  const totalBales = purchases.reduce((s, p) => s + (p.bales ?? 0), 0);
  const pendingGrn = purchases.filter((p) => p.status === "grn-pending").length;
  const totalPurchaseKg = purchases.reduce((s, p) => s + (p.netKg ?? 0), 0);

  const purchaseColumns = [
    { key: "date" as const, label: "Date" },
    { key: "invoiceNo" as const, label: "Invoice" },
    { key: "supplier" as const, label: "Supplier" },
    { key: "grade" as const, label: "Grade" },
    { key: "status" as const, label: "Status" },
  ];
  const supplierColumns = [
    { key: "code" as const, label: "Code" },
    { key: "name" as const, label: "Name" },
    { key: "city" as const, label: "City" },
    { key: "grade" as const, label: "Grade" },
    { key: "status" as const, label: "Status" },
  ];
  const grnColumns = [
    { key: "grnNo" as const, label: "GRN No" },
    { key: "date" as const, label: "Date" },
    { key: "supplier" as const, label: "Supplier" },
    { key: "receivedBy" as const, label: "Received By" },
    { key: "status" as const, label: "Status" },
  ];

  if (!user) return null;

  if (purchasesQ.isLoading)
    return (
      <>
        <PageHeader title="Cotton Purchase" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (purchasesQ.isError)
    return (
      <>
        <PageHeader title="Cotton Purchase" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <PageHeader
        title="Cotton Purchase"
        subtitle="Supplier management, bale purchase, GRN & invoice tracking"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["purchases"] })}
        isRefreshing={purchasesQ.isFetching}
      />
      <AccessGuard module="purchase">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Active Suppliers
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Users className="size-5 text-primary" />
                  {activeSuppliers}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Bales
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <PackageOpen className="size-5 text-success" />
                  {totalBales}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">Total Qty</div>
                <div className="text-2xl font-semibold mt-2">
                  {totalPurchaseKg.toLocaleString()} kg
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Pending GRN
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <ClipboardCheck className="size-5 text-warning" />
                  {pendingGrn}
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="purchases">
            <TabsList>
              <TabsTrigger value="purchases">Purchases</TabsTrigger>
              <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
              <TabsTrigger value="grns">GRN</TabsTrigger>
              <TabsTrigger value="bales">
                <Layers className="size-3.5 mr-1" />
                Bale Management
              </TabsTrigger>
            </TabsList>

            <TabsContent value="purchases">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Bale Purchase Entries</CardTitle>
                  <div className="flex gap-1">
                    {isAdmin && <ColumnConfigurator module="purchase" tableKey="purchases" />}
                    {canEdit && <NewPurchaseDialog />}
                  </div>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={purchases}
                    onFilter={setPurchaseFiltered}
                    columns={purchaseColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Invoice</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Bales</TableHead>
                          <TableHead className="text-right">Gross (kg)</TableHead>
                          <TableHead className="text-right">Net (kg)</TableHead>
                          <TableHead className="text-right">Rate/kg</TableHead>
                          <TableHead className="text-right">Moisture</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseFiltered.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell className="text-sm">{p.date}</TableCell>
                            <TableCell className="font-mono text-xs">{p.invoiceNo}</TableCell>
                            <TableCell>{p.supplier}</TableCell>
                            <TableCell className="text-right">{p.bales}</TableCell>
                            <TableCell className="text-right">{p.grossKg}</TableCell>
                            <TableCell className="text-right font-medium">{p.netKg}</TableCell>
                            <TableCell className="text-right">₹{p.ratePerKg}</TableCell>
                            <TableCell className="text-right">{p.moisture}%</TableCell>
                            <TableCell>
                              <Badge variant={p.grade === "A" ? "default" : "secondary"}>
                                {p.grade}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  p.status === "completed"
                                    ? "default"
                                    : p.status === "grn-pending"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {p.status}
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

            <TabsContent value="suppliers">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Supplier Directory</CardTitle>
                  {isAdmin && <ColumnConfigurator module="purchase" tableKey="suppliers" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={suppliers}
                    onFilter={setSupplierFiltered}
                    columns={supplierColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>City</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {supplierFiltered.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs">{s.code}</TableCell>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.contact}</TableCell>
                            <TableCell>{s.city}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  s.grade === "A"
                                    ? "default"
                                    : s.grade === "B"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {s.grade}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={s.status === "active" ? "default" : "secondary"}>
                                {s.status}
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

            <TabsContent value="grns">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Goods Received Notes</CardTitle>
                  {isAdmin && <ColumnConfigurator module="purchase" tableKey="grns" />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter data={grns} onFilter={setGrnFiltered} columns={grnColumns} />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>GRN No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead className="text-right">Bales</TableHead>
                          <TableHead className="text-right">Net (kg)</TableHead>
                          <TableHead>Received By</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grnFiltered.map((g) => (
                          <TableRow key={g.id}>
                            <TableCell className="font-mono text-xs">{g.grnNo}</TableCell>
                            <TableCell className="text-sm">{g.date}</TableCell>
                            <TableCell>{g.supplier}</TableCell>
                            <TableCell className="text-right">{g.balesReceived}</TableCell>
                            <TableCell className="text-right font-medium">{g.netKg}</TableCell>
                            <TableCell>{g.receivedBy}</TableCell>
                            <TableCell>
                              <Badge variant={g.status === "completed" ? "default" : "secondary"}>
                                {g.status}
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
            <TabsContent value="bales">
              <BaleManagementTab canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function NewPurchaseDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    invoiceNo: "",
    supplier: "",
    bales: 0,
    grossKg: 0,
    netKg: 0,
    ratePerKg: 0,
    moisture: 0,
    grade: "A",
    status: "pending" as const,
  });

  const reqFields = ["date", "invoiceNo", "supplier", "bales", "netKg", "ratePerKg"] as const;
  const allFilled = reqFields.every((f) => {
    const v = form[f];
    if (typeof v === "number") return v > 0;
    return typeof v === "string" && v.trim().length > 0;
  });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await purchaseApi.createPurchase(form);
      if (files.length > 0) {
        await Promise.all(files.map((f) => uploadApi.upload("purchase", entry.id, f.file)));
      }
      return entry;
    },
  });

  const handleCreatePurchase = (e: React.FormEvent) => {
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
        toast.success("Purchase entry created");
        qc.invalidateQueries({ queryKey: ["purchases"] });
        setFiles([]);
        setOpen(false);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.detail || err?.message || "Failed to create purchase entry";
        toast.error(typeof msg === "string" ? msg : "Failed to create purchase entry");
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New purchase
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New purchase entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreatePurchase} className="space-y-3">
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
                Invoice No <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.invoiceNo}
                onChange={(e) => {
                  setForm({ ...form, invoiceNo: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, invoiceNo: "" }));
                }}
                className={requiredErrors.invoiceNo ? "border-destructive" : ""}
              />
              {requiredErrors.invoiceNo && (
                <p className="text-sm text-destructive">{requiredErrors.invoiceNo}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Supplier <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.supplier}
                onChange={(e) => {
                  setForm({ ...form, supplier: e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, supplier: "" }));
                }}
                className={requiredErrors.supplier ? "border-destructive" : ""}
              />
              {requiredErrors.supplier && (
                <p className="text-sm text-destructive">{requiredErrors.supplier}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Bales <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                value={form.bales}
                onChange={(e) => {
                  setForm({ ...form, bales: +e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, bales: "" }));
                }}
                className={requiredErrors.bales ? "border-destructive" : ""}
              />
              {requiredErrors.bales && (
                <p className="text-sm text-destructive">{requiredErrors.bales}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Gross (kg)</Label>
              <Input
                type="number"
                step="0.1"
                value={form.grossKg}
                onChange={(e) => setForm({ ...form, grossKg: +e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Net (kg) <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                value={form.netKg}
                onChange={(e) => {
                  setForm({ ...form, netKg: +e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, netKg: "" }));
                }}
                className={requiredErrors.netKg ? "border-destructive" : ""}
              />
              {requiredErrors.netKg && (
                <p className="text-sm text-destructive">{requiredErrors.netKg}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Rate per kg <span className="text-destructive">*</span>
              </Label>
              <Input
                type="number"
                step="0.1"
                value={form.ratePerKg}
                onChange={(e) => {
                  setForm({ ...form, ratePerKg: +e.target.value });
                  setRequiredErrors((prev) => ({ ...prev, ratePerKg: "" }));
                }}
                className={requiredErrors.ratePerKg ? "border-destructive" : ""}
              />
              {requiredErrors.ratePerKg && (
                <p className="text-sm text-destructive">{requiredErrors.ratePerKg}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Moisture %</Label>
              <Input
                type="number"
                step="0.1"
                value={form.moisture}
                onChange={(e) => setForm({ ...form, moisture: +e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Grade <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.grade}
                onValueChange={(v) => {
                  setForm({ ...form, grade: v });
                  setRequiredErrors((prev) => ({ ...prev, grade: "" }));
                }}
              >
                <SelectTrigger className={requiredErrors.grade ? "border-destructive" : ""}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                </SelectContent>
              </Select>
              {requiredErrors.grade && (
                <p className="text-sm text-destructive">{requiredErrors.grade}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Invoice document (PDF, Excel, image)</Label>
            <FileUpload files={files} onFilesChange={setFiles} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bale Management ─────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  A: "#22c55e",
  B: "#84cc16",
  C: "#eab308",
  D: "#f97316",
  E: "#ef4444",
  F: "#a855f7",
  G: "#3b82f6",
  H: "#64748b",
  Reject: "#dc2626",
};

const YARN_COUNTS = ["10s", "16s", "20s", "24s", "30s", "40s", "60s", "80s", "100s"];

function categoryBadgeVariant(cat?: string) {
  if (!cat) return "outline" as const;
  if (["A", "B"].includes(cat)) return "default" as const;
  if (["C", "D"].includes(cat)) return "secondary" as const;
  return "destructive" as const;
}

function BaleManagementTab({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<"stock" | "mixing" | "stats">("stock");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={view === "stock" ? "default" : "outline"}
          onClick={() => setView("stock")}
        >
          <Layers className="size-3.5 mr-1" /> Bale Stock
        </Button>
        <Button
          size="sm"
          variant={view === "mixing" ? "default" : "outline"}
          onClick={() => setView("mixing")}
        >
          <FlaskConical className="size-3.5 mr-1" /> Mixing Plan
        </Button>
        <Button
          size="sm"
          variant={view === "stats" ? "default" : "outline"}
          onClick={() => setView("stats")}
        >
          <BarChart2 className="size-3.5 mr-1" /> Quality Stats
        </Button>
      </div>
      {view === "stock" && <BaleStockTab canEdit={canEdit} />}
      {view === "mixing" && <MixingPlanTab />}
      {view === "stats" && <QualityDashTab />}
    </div>
  );
}

function BaleStockTab({ canEdit }: { canEdit: boolean }) {
  const { millId } = useActiveMill();
  const [catFilter, setCatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("in-stock");
  const balesQ = useQuery({
    queryKey: ["bales", catFilter, statusFilter, millId],
    queryFn: () =>
      baleApi.getBales({
        mill_id: millId ?? "",
        ...(catFilter !== "all" ? { category: catFilter } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      }),
    staleTime: 30_000,
    enabled: !!millId,
  });
  const bales: any[] = balesQ.data ?? [];
  const total: number = balesQ.data?.total ?? 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">
          Bale Stock
          <span className="ml-2 text-sm font-normal text-muted-foreground">({total} bales)</span>
        </CardTitle>
        <div className="flex gap-2 items-center">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {["A", "B", "C", "D", "E", "F", "G", "H", "Reject"].map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="in-stock">In Stock</SelectItem>
              <SelectItem value="used">Used</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {canEdit && <AddBaleDialog />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[900px] w-full text-xs">
            <TableHeader>
              <TableRow>
                <TableHead>Bale No</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-center">Cat</TableHead>
                <TableHead className="text-right">MIC</TableHead>
                <TableHead className="text-right">Staple (mm)</TableHead>
                <TableHead className="text-right">Str (g/tex)</TableHead>
                <TableHead className="text-right">Unf (%)</TableHead>
                <TableHead className="text-right">SFI</TableHead>
                <TableHead className="text-right">Moist %</TableHead>
                <TableHead className="text-right">Trash %</TableHead>
                <TableHead className="text-right">QI</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bales.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono">{b.bale_number}</TableCell>
                  <TableCell>{b.supplier}</TableCell>
                  <TableCell className="text-muted-foreground">{b.lot_number ?? "—"}</TableCell>
                  <TableCell>{b.date_received}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={categoryBadgeVariant(b.category)}>{b.category ?? "?"}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {b.micronaire?.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">{b.staple_length?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell className="text-right">{b.strength?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell className="text-right">{b.uniformity?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    {b.short_fiber_index?.toFixed(1) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">{b.moisture?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell className="text-right">{b.trash_area?.toFixed(2) ?? "—"}</TableCell>
                  <TableCell className="text-right">{b.quality_index?.toFixed(1) ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        b.status === "in-stock"
                          ? "default"
                          : b.status === "used"
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {b.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {bales.length === 0 && !balesQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-muted-foreground py-8">
                    No bales found. Add bales using HVI test results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function AddBaleDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const empty = {
    bale_number: "",
    supplier: "",
    lot_number: "",
    date_received: new Date().toISOString().slice(0, 10),
    micronaire: "",
    staple_length: "",
    strength: "",
    uniformity: "",
    short_fiber_index: "",
    moisture: "",
    trash_area: "",
    trash_grade: "",
    color_grade: "",
    reflectance: "",
    yellowness: "",
    elongation: "",
    maturity: "",
    sci: "",
  };
  const [form, setForm] = useState(empty);
  const reqFields = ["bale_number", "supplier", "date_received", "micronaire"] as const;
  const allFilled = reqFields.every((f) => {
    const v = form[f];
    return typeof v === "string" && v.trim().length > 0;
  });
  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
    setRequiredErrors((prev) => ({ ...prev, [k]: "" }));
  };

  const m = useMutation({
    mutationFn: () =>
      baleApi.createBale({
        bale_number: form.bale_number,
        supplier: form.supplier,
        lot_number: form.lot_number || null,
        date_received: form.date_received,
        micronaire: parseFloat(form.micronaire),
        staple_length: form.staple_length ? parseFloat(form.staple_length) : null,
        strength: form.strength ? parseFloat(form.strength) : null,
        uniformity: form.uniformity ? parseFloat(form.uniformity) : null,
        short_fiber_index: form.short_fiber_index ? parseFloat(form.short_fiber_index) : null,
        moisture: form.moisture ? parseFloat(form.moisture) : null,
        trash_area: form.trash_area ? parseFloat(form.trash_area) : null,
        trash_grade: form.trash_grade ? parseInt(form.trash_grade) : null,
        color_grade: form.color_grade || null,
        reflectance: form.reflectance ? parseFloat(form.reflectance) : null,
        yellowness: form.yellowness ? parseFloat(form.yellowness) : null,
        elongation: form.elongation ? parseFloat(form.elongation) : null,
        maturity: form.maturity ? parseFloat(form.maturity) : null,
        sci: form.sci ? parseFloat(form.sci) : null,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => {
      const v = form[f];
      if (!v || (typeof v === "string" && !v.trim())) {
        errors[f] = "This field is required";
      }
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, {
      onSuccess: (data: any) => {
        toast.success(`Bale ${data.bale_number} added — Category ${data.category}`);
        qc.invalidateQueries({ queryKey: ["bales"] });
        qc.invalidateQueries({ queryKey: ["bale-stats"] });
        setForm(empty);
        setOpen(false);
      },
      onError: () => toast.error("Failed to add bale"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          Add Bale
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Bale — HVI Data Entry</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>
                Bale Number <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.bale_number}
                onChange={f("bale_number")}
                className={requiredErrors.bale_number ? "border-destructive" : ""}
              />
              {requiredErrors.bale_number && (
                <p className="text-sm text-destructive">{requiredErrors.bale_number}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Supplier <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.supplier}
                onChange={f("supplier")}
                className={requiredErrors.supplier ? "border-destructive" : ""}
              />
              {requiredErrors.supplier && (
                <p className="text-sm text-destructive">{requiredErrors.supplier}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Lot Number</Label>
              <Input value={form.lot_number} onChange={f("lot_number")} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Date Received <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={form.date_received}
                onChange={f("date_received")}
                className={requiredErrors.date_received ? "border-destructive" : ""}
              />
              {requiredErrors.date_received && (
                <p className="text-sm text-destructive">{requiredErrors.date_received}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Color Grade (C.G)</Label>
              <Input value={form.color_grade} onChange={f("color_grade")} placeholder="e.g. 31-3" />
            </div>
          </div>
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">
              HVI Parameters
            </p>
            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>
                  Micronaire (MIC) <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="1"
                  max="7"
                  value={form.micronaire}
                  onChange={f("micronaire")}
                  placeholder="e.g. 3.95"
                  className={requiredErrors.micronaire ? "border-destructive" : ""}
                />
                {requiredErrors.micronaire && (
                  <p className="text-sm text-destructive">{requiredErrors.micronaire}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Staple (mm)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.staple_length}
                  onChange={f("staple_length")}
                  placeholder="e.g. 29.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Strength (g/tex)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.strength}
                  onChange={f("strength")}
                  placeholder="e.g. 28.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Uniformity (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.uniformity}
                  onChange={f("uniformity")}
                  placeholder="e.g. 82.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label>SFI (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.short_fiber_index}
                  onChange={f("short_fiber_index")}
                  placeholder="e.g. 8.2"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moisture (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.moisture}
                  onChange={f("moisture")}
                  placeholder="e.g. 9.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Trash Area (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.trash_area}
                  onChange={f("trash_area")}
                  placeholder="e.g. 0.12"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Trash Grade</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  max="8"
                  value={form.trash_grade}
                  onChange={f("trash_grade")}
                  placeholder="0-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reflectance (Rd)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.reflectance}
                  onChange={f("reflectance")}
                  placeholder="e.g. 74.5"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Yellowness (+b)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.yellowness}
                  onChange={f("yellowness")}
                  placeholder="e.g. 9.8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Elongation (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.elongation}
                  onChange={f("elongation")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Maturity</Label>
                <Input type="number" step="0.01" value={form.maturity} onChange={f("maturity")} />
              </div>
              <div className="space-y-1.5">
                <Label>SCI</Label>
                <Input
                  type="number"
                  step="1"
                  value={form.sci}
                  onChange={f("sci")}
                  placeholder="e.g. 148"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Add Bale"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MixingPlanTab() {
  const qc = useQueryClient();
  const [yarnCount, setYarnCount] = useState("30s");
  const [groupData, setGroupData] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const fetchGroup = async (ids?: string[]) => {
    setLoading(true);
    try {
      const res = await baleApi.getGroup({ yarn_count: yarnCount, bale_ids: ids ?? null });
      setGroupData(res);
      if (!ids) setSelectedIds(new Set((res.selected_bales ?? []).map((b: any) => b.id)));
    } finally {
      setLoading(false);
    }
  };

  const toggleBale = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const blend = useMemo(() => {
    if (!groupData?.selected_bales?.length) return null;
    const sel = groupData.selected_bales.filter((b: any) => selectedIds.has(b.id));
    if (!sel.length) return null;
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a: number, b: number) => a + b, 0) / arr.length : 0;
    const mics = sel.map((b: any) => b.micronaire).filter(Boolean);
    const bMic = avg(mics);
    const micStd =
      mics.length > 1
        ? Math.sqrt(
            mics.reduce((a: number, b: number) => a + (b - bMic) ** 2, 0) / (mics.length - 1),
          )
        : 0;
    const micCv = bMic > 0 ? (micStd / bMic) * 100 : 0;
    const bStaple = avg(sel.map((b: any) => b.staple_length).filter(Boolean));
    const bStrength = avg(sel.map((b: any) => b.strength).filter(Boolean));
    const bUnif = avg(sel.map((b: any) => b.uniformity).filter(Boolean));
    const bTrash = avg(sel.map((b: any) => b.trash_area).filter(Boolean)) || 1;
    const qi =
      bStrength && bUnif && bMic ? (bStrength * bUnif) / (bMic * Math.max(bTrash, 0.1)) : 0;
    return { bMic, micCv, bStaple, bStrength, bUnif, qi, count: sel.length };
  }, [groupData, selectedIds]);

  function exportMixingPlan() {
    if (!groupData?.selected_bales?.length) return;
    const sel = groupData.selected_bales.filter((b: any) => selectedIds.has(b.id));
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      ["Mixing Plan Export"],
      ["Yarn Count:", yarnCount],
      ["Total Bales:", blend?.count ?? 0],
      ["Blend MIC:", blend?.bMic?.toFixed(3) ?? ""],
      ["MIC CV%:", blend?.micCv?.toFixed(2) ?? ""],
      ["Blend Staple (mm):", blend?.bStaple?.toFixed(2) ?? ""],
      ["Blend Strength (g/tex):", blend?.bStrength?.toFixed(2) ?? ""],
      ["Blend Uniformity (%):", blend?.bUnif?.toFixed(2) ?? ""],
      ["Quality Index:", blend?.qi?.toFixed(2) ?? ""],
      [],
      [
        "Recommended MIC Range:",
        `${groupData.recommended_mic_min} – ${groupData.recommended_mic_max}`,
      ],
      [
        "Recommended Staple (mm):",
        `${groupData.recommended_staple_min} – ${groupData.recommended_staple_max}`,
      ],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, ws1, "Summary");
    const headers = [
      "Bale No",
      "Supplier",
      "Lot",
      "Category",
      "MIC",
      "Staple",
      "Strength",
      "Uniformity",
      "SFI",
      "Moisture",
      "Trash%",
      "Color Grade",
      "QI",
    ];
    const rows = sel.map((b: any) => [
      b.bale_number,
      b.supplier,
      b.lot_number ?? "",
      b.category ?? "",
      b.micronaire,
      b.staple_length ?? "",
      b.strength ?? "",
      b.uniformity ?? "",
      b.short_fiber_index ?? "",
      b.moisture ?? "",
      b.trash_area ?? "",
      b.color_grade ?? "",
      b.quality_index ?? "",
    ]);
    const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws2, "Bale List");
    XLSX.writeFile(wb, `mixing_plan_${yarnCount}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Group Selection — Mixing Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div className="space-y-1.5">
              <Label>Target Yarn Count</Label>
              <Select value={yarnCount} onValueChange={setYarnCount}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YARN_COUNTS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => fetchGroup()} disabled={loading}>
              <FlaskConical className="size-4 mr-1" />
              {loading ? "Computing…" : "Get Recommended Group"}
            </Button>
            {blend && (
              <Button
                variant="outline"
                onClick={() => fetchGroup(Array.from(selectedIds))}
                disabled={loading}
              >
                Recalculate Selected
              </Button>
            )}
            {blend && (
              <Button variant="outline" onClick={exportMixingPlan}>
                <Download className="size-4 mr-1" />
                Export Mixing Plan
              </Button>
            )}
          </div>

          {groupData && (
            <div className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3">
              Recommended MIC:{" "}
              <strong>
                {groupData.recommended_mic_min} – {groupData.recommended_mic_max}
              </strong>{" "}
              | Staple:{" "}
              <strong>
                {groupData.recommended_staple_min} – {groupData.recommended_staple_max} mm
              </strong>
            </div>
          )}

          {blend && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                {
                  label: "Bales Selected",
                  value: blend.count,
                  icon: <Layers className="size-4 text-primary" />,
                },
                {
                  label: "Blend MIC",
                  value: blend.bMic.toFixed(3),
                  icon: <TrendingUp className="size-4 text-success" />,
                },
                {
                  label: "MIC CV%",
                  value: `${blend.micCv.toFixed(2)}%`,
                  icon: (
                    <AlertTriangle
                      className={`size-4 ${blend.micCv > 10 ? "text-destructive" : "text-warning"}`}
                    />
                  ),
                },
                {
                  label: "Blend Strength",
                  value: `${blend.bStrength.toFixed(1)} g/tex`,
                  icon: <TrendingUp className="size-4 text-success" />,
                },
                {
                  label: "Blend Staple",
                  value: `${blend.bStaple.toFixed(1)} mm`,
                  icon: <TrendingUp className="size-4 text-primary" />,
                },
                {
                  label: "Uniformity",
                  value: `${blend.bUnif.toFixed(1)}%`,
                  icon: <TrendingUp className="size-4 text-primary" />,
                },
                {
                  label: "Quality Index",
                  value: blend.qi.toFixed(2),
                  icon: <TrendingUp className="size-4 text-success" />,
                },
              ].map(({ label, value, icon }) => (
                <Card key={label}>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-lg font-semibold flex items-center gap-1 mt-1">
                      {icon}
                      {value}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {groupData?.selected_bales?.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">
                Bales in Group
                <span className="ml-2 text-muted-foreground text-xs">
                  (check/uncheck to adjust mixing plan)
                </span>
              </p>
              <div className="border rounded-md max-h-72 overflow-auto">
                <Table className="min-w-[700px] w-full text-xs">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Bale No</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead className="text-center">Cat</TableHead>
                      <TableHead className="text-right">MIC</TableHead>
                      <TableHead className="text-right">Staple</TableHead>
                      <TableHead className="text-right">Str</TableHead>
                      <TableHead className="text-right">Unf%</TableHead>
                      <TableHead className="text-right">Trash%</TableHead>
                      <TableHead className="text-right">QI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupData.selected_bales.map((b: any) => {
                      const checked = selectedIds.has(b.id);
                      return (
                        <TableRow
                          key={b.id}
                          className={`cursor-pointer ${!checked ? "opacity-40" : ""}`}
                          onClick={() => toggleBale(b.id)}
                        >
                          <TableCell>
                            {checked ? (
                              <CheckSquare className="size-4 text-primary" />
                            ) : (
                              <Square className="size-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-mono">{b.bale_number}</TableCell>
                          <TableCell>{b.supplier}</TableCell>
                          <TableCell>{b.lot_number ?? "—"}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={categoryBadgeVariant(b.category)}>{b.category}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {b.micronaire?.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.staple_length?.toFixed(1) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.strength?.toFixed(1) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.uniformity?.toFixed(1) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.trash_area?.toFixed(2) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {b.quality_index?.toFixed(1) ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {groupData && groupData.selected_bales?.length === 0 && (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No in-stock bales match the recommended MIC range for {yarnCount}.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QualityDashTab() {
  const { millId } = useActiveMill();
  const statsQ = useQuery({
    queryKey: ["bale-stats", millId],
    queryFn: baleApi.getStats,
    staleTime: 60_000,
    enabled: !!millId,
  });
  const s = statsQ.data;

  if (statsQ.isLoading)
    return <div className="p-6 text-sm text-muted-foreground">Loading stats…</div>;
  if (!s || s.total_bales === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No bale data yet. Add bales in the Bale Stock tab.
        </CardContent>
      </Card>
    );
  }

  const catData = Object.entries(s.bales_by_category ?? {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([cat, count]) => ({ cat, count, fill: CATEGORY_COLORS[cat] ?? "#64748b" }));

  const supplierData = ((s.supplier_stats ?? []) as any[])
    .sort((a, b) => b.bale_count - a.bale_count)
    .slice(0, 10)
    .map((s: any) => ({
      name: s.supplier.length > 12 ? s.supplier.slice(0, 12) + "…" : s.supplier,
      avg_mic: s.avg_mic,
      bale_count: s.bale_count,
    }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Bales", value: s.total_bales },
          { label: "In Stock", value: s.in_stock },
          { label: "Avg MIC", value: s.avg_mic?.toFixed(3) },
          { label: "MIC CV%", value: `${s.mic_cv?.toFixed(2)}%` },
          { label: "Avg Staple (mm)", value: s.avg_staple?.toFixed(1) },
          { label: "Avg Strength", value: `${s.avg_strength?.toFixed(1)} g/tex` },
          { label: "Avg Uniformity", value: `${s.avg_uniformity?.toFixed(1)}%` },
          { label: "Used / Rejected", value: `${s.used} / ${s.rejected}` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground uppercase">{label}</div>
              <div className="text-xl font-semibold mt-1">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Bales by Category (MIC Classification)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="cat" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v} bales`]} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {catData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              A=3.61–3.80, B=3.81–3.90, C=3.91–4.00, D=4.01–4.10, E=4.11–4.20, F=4.21–4.30,
              G=4.31–4.50, H=4.51–4.70
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Supplier-wise Avg MIC</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={supplierData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[3, 5]} tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`MIC ${v?.toFixed(3)}`]} />
                <Bar dataKey="avg_mic" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                  {supplierData.map((_: any, idx: number) => (
                    <Cell key={idx} fill="#3b82f6" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {((s.lot_stats ?? []) as any[]).length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lot-wise Quality (Avg MIC)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="w-full overflow-x-auto">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    <TableHead>Lot Number</TableHead>
                    <TableHead className="text-right">Bales</TableHead>
                    <TableHead className="text-right">Avg MIC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {((s.lot_stats ?? []) as any[]).map((l: any) => (
                    <TableRow key={l.lot_number}>
                      <TableCell className="font-mono">{l.lot_number}</TableCell>
                      <TableCell className="text-right">{l.bale_count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {l.avg_mic?.toFixed(3)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

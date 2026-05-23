import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseApi, uploadApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
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
import { useState } from "react";
import { toast } from "sonner";
import { Plus, ShoppingCart, Users, ClipboardCheck, PackageOpen } from "lucide-react";

export const Route = createFileRoute("/_app/purchase")({
  head: () => ({ meta: [{ title: "Cotton Purchase — SpinFlow ERP" }] }),
  component: PurchasePage,
});

function PurchasePage() {
  const user = useAuth((s) => s.user)!;
  const canEdit = canWrite(user.role, "purchase");
  const isAdmin = user.role === "SUPER_ADMIN" || user.role === "MILL_OWNER";
  const suppliersQ = useQuery({ queryKey: ["suppliers"], queryFn: purchaseApi.getSuppliers });
  const purchasesQ = useQuery({ queryKey: ["purchases"], queryFn: purchaseApi.getPurchases });
  const grnsQ = useQuery({ queryKey: ["grns"], queryFn: purchaseApi.getGRNs });

  const suppliers = suppliersQ.data ?? [];
  const purchases = purchasesQ.data ?? [];
  const grns = grnsQ.data ?? [];

  const [purchaseFiltered, setPurchaseFiltered] = useState(purchases);
  const [supplierFiltered, setSupplierFiltered] = useState(suppliers);
  const [grnFiltered, setGrnFiltered] = useState(grns);

  const activeSuppliers = suppliers.filter((s) => s.status === "active").length;
  const totalBales = purchases.reduce((s, p) => s + p.bales, 0);
  const pendingGrn = purchases.filter((p) => p.status === "grn-pending").length;
  const totalPurchaseKg = purchases.reduce((s, p) => s + p.netKg, 0);

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

  return (
    <>
      <Topbar
        title="Cotton Purchase"
        subtitle="Supplier management, bale purchase, GRN & invoice tracking"
      />
      <AccessGuard module="purchase">
        <div className="p-6 space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
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
              <div className="text-xs uppercase text-muted-foreground font-medium">Total Bales</div>
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
              <div className="text-xs uppercase text-muted-foreground font-medium">Pending GRN</div>
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
                <ExcelColumnFilter data={purchases} onFilter={setPurchaseFiltered} columns={purchaseColumns} />
                <Table>
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
                          <Badge variant={p.grade === "A" ? "default" : "secondary"}>{p.grade}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              p.status === "completed" ? "default"
                              : p.status === "grn-pending" ? "secondary"
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
                <ExcelColumnFilter data={suppliers} onFilter={setSupplierFiltered} columns={supplierColumns} />
                <Table>
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
                          <Badge variant={s.grade === "A" ? "default" : s.grade === "B" ? "secondary" : "destructive"}>
                            {s.grade}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                <Table>
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
                          <Badge variant={g.status === "completed" ? "default" : "secondary"}>{g.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Purchase entry created");
        qc.invalidateQueries({ queryKey: ["purchases"] });
        setFiles([]);
        setOpen(false);
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
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Invoice No</Label>
              <Input value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Bales</Label>
              <Input type="number" value={form.bales} onChange={(e) => setForm({ ...form, bales: +e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Gross (kg)</Label>
              <Input type="number" step="0.1" value={form.grossKg} onChange={(e) => setForm({ ...form, grossKg: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Net (kg)</Label>
              <Input type="number" step="0.1" value={form.netKg} onChange={(e) => setForm({ ...form, netKg: +e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Rate per kg</Label>
              <Input type="number" step="0.1" value={form.ratePerKg} onChange={(e) => setForm({ ...form, ratePerKg: +e.target.value })} required />
            </div>
            <div className="space-y-1.5">
              <Label>Moisture %</Label>
              <Input type="number" step="0.1" value={form.moisture} onChange={(e) => setForm({ ...form, moisture: +e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Grade</Label>
              <Select value={form.grade} onValueChange={(v) => setForm({ ...form, grade: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Invoice document (PDF, Excel, image)</Label>
            <FileUpload files={files} onFilesChange={setFiles} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Create entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

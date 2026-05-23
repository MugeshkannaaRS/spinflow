import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api-service";
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
import { useState, useEffect } from "react";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { toast } from "sonner";
import { Plus, Boxes, ArrowRightLeft, AlertTriangle, Package } from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — SpinFlow ERP" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "inventory");
  const lotsQ = useQuery({
    queryKey: ["inventory-lots"],
    queryFn: inventoryApi.getLots,
    staleTime: 60_000,
    retry: 1,
  });
  const transfersQ = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: inventoryApi.getTransfers,
    staleTime: 60_000,
    retry: 1,
  });

  const lots: any[] = lotsQ.data ?? [];
  const transfers: any[] = transfersQ.data ?? [];

  const [filteredLots, setFilteredLots] = useState<any[]>([]);
  const [filteredTransfers, setFilteredTransfers] = useState<any[]>([]);

  useEffect(() => {
    setFilteredLots(lotsQ.data ?? []);
  }, [lotsQ.data]);
  useEffect(() => {
    setFilteredTransfers(transfersQ.data ?? []);
  }, [transfersQ.data]);

  const totalStock = lots.reduce((s, l) => s + (l.quantity ?? 0), 0);
  const inStock = lots.filter((l) => l.status === "in-stock").length;
  const ageingLots = lots.filter((l) => l.age > 14).length;
  const lowStock = lots.filter((l) => l.quantity < 3000).length;

  if (!user) return null;

  if (lotsQ.isLoading)
    return (
      <>
        <Topbar title="Inventory" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (lotsQ.isError)
    return (
      <>
        <Topbar title="Inventory" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Inventory"
        subtitle="Lot tracking, godown stock, transfers & ageing analysis"
      />
      <AccessGuard module="inventory">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Stock
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Package className="size-5 text-primary" />
                  {totalStock.toLocaleString()} kg
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Lots In Stock
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Boxes className="size-5 text-success" />
                  {inStock}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Ageing (&gt;14d)
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />
                  {ageingLots}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Low Stock Lots
                </div>
                <div className="text-2xl font-semibold mt-2">{lowStock}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="lots">
            <TabsList>
              <TabsTrigger value="lots">Lots & Stock</TabsTrigger>
              <TabsTrigger value="transfers">Stock Transfers</TabsTrigger>
            </TabsList>

            <TabsContent value="lots">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Inventory Lots</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={lots}
                    onFilter={setFilteredLots}
                    columns={[
                      { key: "lotNo" as const, label: "Lot No", placeholder: "Filter lot..." },
                      { key: "type" as const, label: "Type", placeholder: "Filter type..." },
                      {
                        key: "department" as const,
                        label: "Department",
                        placeholder: "Filter dept...",
                      },
                      {
                        key: "location" as const,
                        label: "Location",
                        placeholder: "Filter location...",
                      },
                      { key: "grade" as const, label: "Grade", placeholder: "Filter grade..." },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lot No</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Grade</TableHead>
                          <TableHead>Produced</TableHead>
                          <TableHead className="text-right">Age (d)</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLots.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-mono text-xs">{l.lotNo}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{l.type}</Badge>
                            </TableCell>
                            <TableCell>{l.department}</TableCell>
                            <TableCell className="text-right">
                              {(l.quantity ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell>{l.location}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  l.grade === "A+" || l.grade === "A"
                                    ? "default"
                                    : l.grade === "B"
                                      ? "secondary"
                                      : "destructive"
                                }
                              >
                                {l.grade}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{l.producedDate}</TableCell>
                            <TableCell className="text-right">
                              <span className={l.age > 14 ? "text-destructive font-medium" : ""}>
                                {l.age}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  l.status === "in-stock"
                                    ? "default"
                                    : l.status === "transferred"
                                      ? "secondary"
                                      : "outline"
                                }
                              >
                                {l.status}
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

            <TabsContent value="transfers">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Stock Transfers</CardTitle>
                  {canEdit && <NewTransferDialog />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={transfers}
                    onFilter={setFilteredTransfers}
                    columns={[
                      { key: "date" as const, label: "Date", placeholder: "Filter date..." },
                      { key: "lotNo" as const, label: "Lot", placeholder: "Filter lot..." },
                      {
                        key: "fromLocation" as const,
                        label: "From",
                        placeholder: "Filter from...",
                      },
                      { key: "toLocation" as const, label: "To", placeholder: "Filter to..." },
                      {
                        key: "transferredBy" as const,
                        label: "By",
                        placeholder: "Filter transferred by...",
                      },
                      { key: "status" as const, label: "Status", placeholder: "Filter status..." },
                    ]}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>From</TableHead>
                          <TableHead>To</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>By</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTransfers.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm">{t.date}</TableCell>
                            <TableCell className="font-mono text-xs">{t.lotNo}</TableCell>
                            <TableCell>{t.fromLocation}</TableCell>
                            <TableCell>
                              <ArrowRightLeft className="size-3 inline mr-1 text-muted-foreground" />
                              {t.toLocation}
                            </TableCell>
                            <TableCell className="text-right">
                              {t.quantity} {t.unit}
                            </TableCell>
                            <TableCell>{t.transferredBy}</TableCell>
                            <TableCell>
                              <Badge variant={t.status === "completed" ? "default" : "secondary"}>
                                {t.status}
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
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function NewTransferDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    lotNo: "",
    fromLocation: "",
    toLocation: "",
    quantity: 0,
    unit: "kg",
    transferredBy: "",
    status: "pending" as const,
  });

  const m = useMutation({
    mutationFn: () => inventoryApi.createTransfer(form),
  });

  const handleCreateTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Stock transfer created");
        qc.invalidateQueries({ queryKey: ["stock-transfers"] });
        setOpen(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" />
          New transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-lg mx-4 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>New stock transfer</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateTransfer} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lot No</Label>
              <Input
                value={form.lotNo}
                onChange={(e) => setForm({ ...form, lotNo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>From location</Label>
              <Input
                value={form.fromLocation}
                onChange={(e) => setForm({ ...form, fromLocation: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>To location</Label>
              <Input
                value={form.toLocation}
                onChange={(e) => setForm({ ...form, toLocation: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: +e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Transferred by</Label>
              <Input
                value={form.transferredBy}
                onChange={(e) => setForm({ ...form, transferredBy: e.target.value })}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Create transfer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

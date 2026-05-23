import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, uploadApi } from "@/lib/api-service";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExcelColumnFilter } from "@/components/ui/excel-column-filter";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus, Warehouse, AlertTriangle, ArrowDownToLine, Package } from "lucide-react";

export const Route = createFileRoute("/_app/stores")({
  head: () => ({ meta: [{ title: "Stores — SpinFlow ERP" }] }),
  component: StoresPage,
});

function StoresPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "stores");
  const itemsQ = useQuery({
    queryKey: ["spare-items"],
    queryFn: storesApi.getSpares,
    staleTime: 60_000,
    retry: 1,
  });
  const issuesQ = useQuery({
    queryKey: ["issue-notes"],
    queryFn: storesApi.getIssues,
    staleTime: 60_000,
    retry: 1,
  });

  const items: any[] = itemsQ.data ?? [];
  const issues: any[] = issuesQ.data ?? [];

  const [itemFiltered, setItemFiltered] = useState<any[]>([]);
  const [issueFiltered, setIssueFiltered] = useState<any[]>([]);

  useEffect(() => {
    setItemFiltered(itemsQ.data ?? []);
  }, [itemsQ.data]);
  useEffect(() => {
    setIssueFiltered(issuesQ.data ?? []);
  }, [issuesQ.data]);

  const totalItems = items.length;
  const lowStockItems = items.filter((i) => i.stock <= i.minStock).length;
  const totalStock = items.reduce((s, i) => s + (i.stock ?? 0), 0);
  const reorderItems = items.filter((i) => i.stock < i.minStock * 0.5).length;

  const itemColumns = [
    { key: "code" as const, label: "Code" },
    { key: "name" as const, label: "Name" },
    { key: "category" as const, label: "Category" },
    { key: "vendor" as const, label: "Vendor" },
  ];
  const issueColumns = [
    { key: "date" as const, label: "Date" },
    { key: "itemCode" as const, label: "Item" },
    { key: "issuedTo" as const, label: "Issued To" },
    { key: "department" as const, label: "Department" },
    { key: "issuedBy" as const, label: "Issued By" },
  ];

  if (!user) return null;

  if (itemsQ.isLoading)
    return (
      <>
        <Topbar title="Stores & Spares" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (itemsQ.isError)
    return (
      <>
        <Topbar title="Stores & Spares" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  return (
    <>
      <Topbar
        title="Stores & Spares"
        subtitle="Spare inventory, reorder alerts, issue notes & vendor management"
      />
      <AccessGuard module="stores">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Spare Items
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Package className="size-5 text-primary" />
                  {totalItems}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Total Stock
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <Warehouse className="size-5 text-success" />
                  {totalStock} units
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Low Stock Items
                </div>
                <div className="text-2xl font-semibold mt-2 flex items-center gap-2">
                  <AlertTriangle className="size-5 text-warning" />
                  {lowStockItems}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase text-muted-foreground font-medium">
                  Needs Reorder
                </div>
                <div className="text-2xl font-semibold mt-2">{reorderItems}</div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="inventory">
            <TabsList>
              <TabsTrigger value="inventory">Spare Inventory</TabsTrigger>
              <TabsTrigger value="issues">Issue Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Spare Parts & Consumables</CardTitle>
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={items}
                    onFilter={setItemFiltered}
                    columns={itemColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="text-right">Stock</TableHead>
                          <TableHead className="text-right">Min Stock</TableHead>
                          <TableHead>Unit</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itemFiltered.map((i) => (
                          <TableRow key={i.id}>
                            <TableCell className="font-mono text-xs">{i.code}</TableCell>
                            <TableCell className="font-medium">{i.name}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{i.category}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">{i.stock}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {i.minStock}
                            </TableCell>
                            <TableCell>{i.unit}</TableCell>
                            <TableCell>{i.location}</TableCell>
                            <TableCell className="text-sm">{i.vendor}</TableCell>
                            <TableCell>
                              {i.stock <= i.minStock ? (
                                <Badge
                                  variant={i.stock < i.minStock * 0.5 ? "destructive" : "secondary"}
                                >
                                  {i.stock < i.minStock * 0.5 ? "Reorder" : "Low"}
                                </Badge>
                              ) : (
                                <Badge variant="default">OK</Badge>
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

            <TabsContent value="issues">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Issue Notes</CardTitle>
                  {canEdit && <NewIssueNoteDialog />}
                </CardHeader>
                <CardContent>
                  <ExcelColumnFilter
                    data={issues}
                    onFilter={setIssueFiltered}
                    columns={issueColumns}
                  />
                  <div className="w-full overflow-x-auto">
                    <Table className="min-w-[640px] w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Issued To</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Purpose</TableHead>
                          <TableHead>Issued By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {issueFiltered.map((n) => (
                          <TableRow key={n.id}>
                            <TableCell className="text-sm">{n.date}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{n.itemCode}</span> — {n.itemName}
                            </TableCell>
                            <TableCell className="text-right font-medium">{n.quantity}</TableCell>
                            <TableCell>{n.issuedTo}</TableCell>
                            <TableCell>{n.department}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{n.purpose}</TableCell>
                            <TableCell>{n.issuedBy}</TableCell>
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

function NewIssueNoteDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    itemCode: "",
    itemName: "",
    quantity: 0,
    issuedTo: "",
    department: "",
    purpose: "",
    issuedBy: "",
  });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await storesApi.createIssue(form);
      if (files.length > 0) {
        await Promise.all(files.map((f) => uploadApi.upload("stores_issue", entry.id, f.file)));
      }
      return entry;
    },
  });

  const handleCreateIssue = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Issue note created");
        qc.invalidateQueries({ queryKey: ["issue-notes"] });
        qc.invalidateQueries({ queryKey: ["spare-items"] });
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
          New issue
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New issue note</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreateIssue} className="space-y-3">
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
              <Label>Item code</Label>
              <Input
                value={form.itemCode}
                onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Item name</Label>
              <Input
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
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
              <Label>Issued to</Label>
              <Input
                value={form.issuedTo}
                onChange={(e) => setForm({ ...form, issuedTo: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Purpose</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issued by</Label>
              <Input
                value={form.issuedBy}
                onChange={(e) => setForm({ ...form, issuedBy: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Attachment</Label>
              <FileUpload files={files} onFilesChange={setFiles} multiple={false} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending}>
              {m.isPending ? "Saving…" : "Create issue note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

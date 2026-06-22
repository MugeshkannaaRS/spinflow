import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, uploadApi, exportApi } from "@/lib/api-service";
import { ExportDateRangeButton } from "@/components/ui/ExportDateRangeButton";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { AccessGuard } from "@/components/AccessGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRBAC } from "@/hooks/useRBAC";
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
  DialogDescription,
} from "@/components/ui/dialog";
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { UniversalImportModal } from "@/components/ui/UniversalImportModal";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { DataTable } from "@/components/ui/DataTable";
import type { ColDef } from "@/components/ui/DataTable";
import { toast } from "sonner";
import { Plus, Warehouse, AlertTriangle, Package, Pencil, ArrowDown, Trash2 } from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_app/stores")({
  head: () => ({ meta: [{ title: "Stores — SpinFlow ERP" }] }),
  component: StoresPage,
});

function StoresPage() {
  const user = useAuth((s) => s.user);
  const { canAccess } = useRBAC();
  const canEdit = canAccess("stores", true);
  const qc = useQueryClient();
  const { millId } = useActiveMill();
  const itemsQ = useQuery({
    queryKey: ["spare-items", millId],
    queryFn: storesApi.getSpares,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });
  const issuesQ = useQuery({
    queryKey: ["issue-notes", millId],
    queryFn: storesApi.getIssues,
    staleTime: 60_000,
    retry: 1,
    enabled: !!millId,
  });

  const items: any[] = itemsQ.data ?? [];
  const issues: any[] = issuesQ.data ?? [];

  const totalItems = items.length;
  const lowStockItems = items.filter((i) => i.stock <= i.minStock).length;
  const totalStock = items.reduce((s, i) => s + (i.stock ?? 0), 0);
  const reorderItems = items.filter((i) => i.stock < i.minStock * 0.5).length;

  const spareColConfig = useColumnConfig("stores_spares");
  const issueColConfig = useColumnConfig("stores_issues");

  if (!user)
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (itemsQ.isLoading)
    return (
      <>
        <PageHeader title="Stores & Spares" subtitle="Loading..." />
        <div className="p-6 text-sm text-muted-foreground">Loading data…</div>
      </>
    );
  if (itemsQ.isError)
    return (
      <>
        <PageHeader title="Stores & Spares" subtitle="Error" />
        <div className="p-6 text-sm text-destructive">Error loading data.</div>
      </>
    );

  const itemCols: ColDef[] = [
    { key: "code", label: spareColConfig.getLabel("code"), className: "font-mono text-xs" },
    {
      key: "name",
      label: spareColConfig.getLabel("name"),
      render: (i: any) => <span className="font-medium">{i.name}</span>,
    },
    {
      key: "category",
      label: spareColConfig.getLabel("category"),
      type: "status",
      render: (i: any) => <Badge variant="outline">{i.category}</Badge>,
    },
    {
      key: "stock",
      label: spareColConfig.getLabel("stock"),
      render: (i: any) => <span className="font-medium">{i.stock}</span>,
    },
    {
      key: "minStock",
      label: spareColConfig.getLabel("minStock"),
      className: "text-muted-foreground",
    },
    { key: "unit", label: spareColConfig.getLabel("unit"), type: "status" },
    { key: "location", label: spareColConfig.getLabel("location") },
    { key: "vendor", label: spareColConfig.getLabel("vendor") },
    {
      key: "status",
      label: spareColConfig.getLabel("status"),
      type: "status",
      filterable: false,
      render: (i: any) => {
        const critical = i.stock <= i.minStock * 0.5;
        const low = i.stock <= i.minStock;
        if (critical) return <Badge variant="destructive">🔴 Critical</Badge>;
        if (low) return <Badge variant="secondary">🟡 Low</Badge>;
        return (
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100"
          >
            🟢 OK
          </Badge>
        );
      },
    },
  ];

  const issueCols: ColDef[] = [
    { key: "date", label: issueColConfig.getLabel("date"), type: "date" },
    { key: "itemCode", label: issueColConfig.getLabel("itemCode"), className: "font-mono text-xs" },
    { key: "quantity", label: issueColConfig.getLabel("quantity") },
    { key: "issuedTo", label: issueColConfig.getLabel("issuedTo") },
    { key: "department", label: issueColConfig.getLabel("department"), type: "status" },
    { key: "purpose", label: issueColConfig.getLabel("purpose"), className: "max-w-xs truncate" },
    { key: "issuedBy", label: issueColConfig.getLabel("issuedBy") },
  ];

  return (
    <>
      <PageHeader
        title="Stores & Spares"
        subtitle="Spare inventory, reorder alerts, issue notes & vendor management"
        onRefresh={() => qc.invalidateQueries({ queryKey: ["spare-items"] })}
        isRefreshing={itemsQ.isFetching}
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
                  <Warehouse className="size-5 text-green-600" />
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
                  <AlertTriangle className="size-5 text-amber-500" />
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
                  <ErrorBoundary inline label="Spare Inventory">
                    <DataTable
                      tableId="stores_spares"
                      columns={itemCols}
                      data={items}
                      loading={itemsQ.isLoading}
                      rowKey={(i) => i.id}
                      exportFilename="spare_inventory"
                      toolbar={
                        canEdit ? (
                          <div className="flex gap-2">
                            <AddSpareSheet />
                            <ImportSparesDialog />
                          </div>
                        ) : undefined
                      }
                      actions={
                        canEdit
                          ? (row: any) => (
                              <div className="flex gap-1">
                                <ReceiveStockButton item={row} />
                                <EditSpareSheet item={row} />
                                {row.is_active && (
                                  <ConfirmDeleteButton
                                    onConfirm={async () => {
                                      await storesApi.deleteSpare(row.id);
                                      qc.invalidateQueries({ queryKey: ["spare-items"] });
                                    }}
                                    label={`Delete ${row.name || row.code}? This will deactivate it.`}
                                    successMessage="Spare deleted"
                                  />
                                )}
                              </div>
                            )
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="issues">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Issue Notes</CardTitle>
                  {canEdit && <NewIssueNoteDialog items={items} />}
                </CardHeader>
                <CardContent>
                  <ErrorBoundary inline label="Issue Notes">
                    <DataTable
                      tableId="stores_issues"
                      columns={issueCols}
                      data={issues}
                      loading={issuesQ.isLoading}
                      rowKey={(n) => n.id}
                      exportFilename="issue_notes"
                      disableExport={true}
                      toolbar={
                        <ExportDateRangeButton
                          onExportXlsx={(f, t) => exportApi.storesXlsx(f, t)}
                        />
                      }
                      actions={
                        canEdit
                          ? (n: any) => (
                              <ConfirmDeleteButton
                                onConfirm={async () => {
                                  await storesApi.deleteIssue(n.id);
                                  qc.invalidateQueries({ queryKey: ["issue-notes"] });
                                }}
                                label="Delete this issue note permanently?"
                                successMessage="Issue note deleted"
                              />
                            )
                          : undefined
                      }
                    />
                  </ErrorBoundary>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </AccessGuard>
    </>
  );
}

function NewIssueNoteDialog({ items }: { items: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const issueColConfig = useColumnConfig("stores_issues");
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

  const reqFields = [
    "date",
    "itemCode",
    "itemName",
    "quantity",
    "issuedTo",
    "department",
    "issuedBy",
  ] as const;
  const allFilled = reqFields.every((f) => {
    const v = (form as any)[f];
    return typeof v === "number" ? v > 0 : typeof v === "string" && v.trim().length > 0;
  });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await storesApi.createIssue(form);
      if (files.length > 0)
        await Promise.all(files.map((f) => uploadApi.upload("stores_issue", entry.id, f.file)));
      return entry;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => {
      const v = (form as any)[f];
      if (typeof v === "number" ? v <= 0 : !v || !v.trim()) errors[f] = "Required";
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const spare = items.find((i: any) => i.code === form.itemCode);
    if (spare && form.quantity > spare.stock) {
      toast.error(
        `Insufficient stock for "${form.itemCode}". Available: ${spare.stock}, requested: ${form.quantity}`,
      );
      return;
    }

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

  const fi = (key: keyof typeof form, type?: string) => ({
    value: String((form as any)[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value });
      setRequiredErrors((p) => ({ ...p, [key]: "" }));
    },
    className: requiredErrors[key as string] ? "border-destructive" : "",
  });

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
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["date", "itemCode", "itemName", "issuedTo", "department", "issuedBy"] as const).map(
              (key) => (
                <div key={key} className="space-y-1.5">
                  <Label>
                    {issueColConfig.getLabel(key)} <span className="text-destructive">*</span>
                  </Label>
                  <Input type={key === "date" ? "date" : "text"} {...fi(key)} />
                  {requiredErrors[key] && (
                    <p className="text-xs text-destructive">{requiredErrors[key]}</p>
                  )}
                </div>
              ),
            )}
            <div className="space-y-1.5">
              <Label>
                {issueColConfig.getLabel("quantity")} <span className="text-destructive">*</span>
              </Label>
              <Input type="number" {...fi("quantity", "number")} />
              {requiredErrors.quantity && (
                <p className="text-xs text-destructive">{requiredErrors.quantity}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{issueColConfig.getLabel("purpose")}</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Attachment</Label>
              <FileUpload files={files} onFilesChange={setFiles} multiple={false} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Create issue note"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSpareSheet() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    code: "",
    name: "",
    category: "",
    unit: "Nos",
    currentStock: 0,
    reorderLevel: 0,
    location: "",
    unitPrice: 0,
  });

  const reqFields = ["code", "name"] as const;
  const allFilled = reqFields.every((f) => (form as any)[f].trim().length > 0);

  const m = useMutation({
    mutationFn: () =>
      storesApi.createSpare({
        item_code: form.code,
        name: form.name,
        category: form.category,
        unit: form.unit,
        current_stock: form.currentStock,
        reorder_level: form.reorderLevel,
        location: form.location,
        unit_price: form.unitPrice,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => {
      if (!(form as any)[f].trim()) errors[f] = "Required";
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Spare created");
        qc.invalidateQueries({ queryKey: ["spare-items"] });
        setForm({
          code: "",
          name: "",
          category: "",
          unit: "Nos",
          currentStock: 0,
          reorderLevel: 0,
          location: "",
          unitPrice: 0,
        });
        setOpen(false);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.detail || err?.message || "Failed to create spare";
        toast.error(typeof msg === "string" ? msg : "Failed to create spare");
      },
    });
  };

  const fi = (key: string) => ({
    value: String((form as any)[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: e.target.value });
      setRequiredErrors((p) => ({ ...p, [key]: "" }));
    },
    className: requiredErrors[key] ? "border-destructive" : "",
  });

  const fnum = (key: string) => ({
    value: String((form as any)[key] ?? "0"),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: +e.target.value });
      setRequiredErrors((p) => ({ ...p, [key]: "" }));
    },
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4 mr-1" />
        Add Spare
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Spare</DialogTitle>
          <DialogDescription>Enter the details for the new spare part.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Code <span className="text-destructive">*</span>
              </Label>
              <Input {...fi("code")} placeholder="e.g. SP001" />
              {requiredErrors.code && (
                <p className="text-xs text-destructive">{requiredErrors.code}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input {...fi("name")} placeholder="e.g. Bearing 6205" />
              {requiredErrors.name && (
                <p className="text-xs text-destructive">{requiredErrors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input {...fi("category")} placeholder="e.g. Bearings" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input {...fi("unit")} placeholder="Nos" />
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input type="number" {...fnum("currentStock")} />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input type="number" {...fnum("reorderLevel")} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input {...fi("location")} placeholder="e.g. Store A" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price</Label>
              <Input type="number" {...fnum("unitPrice")} step="0.01" />
            </div>
          </div>
          <DialogFooter>
                          <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Create spare"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

function EditSpareSheet({ item }: { item: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ ...item });

  const reqFields = ["name"] as const;
  const allFilled = reqFields.every((f) => String((form as any)[f] ?? "").trim().length > 0);

  const m = useMutation({
    mutationFn: () =>
      storesApi.updateSpare(item.id, {
        name: form.name,
        category: form.category,
        unit: form.unit,
        current_stock: form.currentStock ?? form.stock,
        reorder_level: form.reorderLevel ?? form.minStock,
        location: form.location,
        unit_price: form.unitPrice,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => {
      if (!String((form as any)[f] ?? "").trim()) errors[f] = "Required";
    });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Spare updated");
        qc.invalidateQueries({ queryKey: ["spare-items"] });
        setOpen(false);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.detail || err?.message || "Failed to update spare";
        toast.error(typeof msg === "string" ? msg : "Failed to update spare");
      },
    });
  };

  useEffect(() => {
    if (open) {
      setForm({
        name: item.name ?? "",
        category: item.category ?? "",
        unit: item.unit ?? "Nos",
        currentStock: item.currentStock ?? item.stock ?? 0,
        reorderLevel: item.reorderLevel ?? item.minStock ?? 0,
        location: item.location ?? "",
        unitPrice: item.unitPrice ?? 0,
      });
      setRequiredErrors({});
    }
  }, [open, item]);

  const fi = (key: string) => ({
    value: String((form as any)[key] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: e.target.value });
      setRequiredErrors((p) => ({ ...p, [key]: "" }));
    },
    className: requiredErrors[key] ? "border-destructive" : "",
  });

  const fnum = (key: string) => ({
    value: String((form as any)[key] ?? "0"),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm({ ...form, [key]: +e.target.value });
      setRequiredErrors((p) => ({ ...p, [key]: "" }));
    },
  });

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Spare — {item.code}</DialogTitle>
          <DialogDescription>Update the spare part details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input {...fi("name")} />
              {requiredErrors.name && (
                <p className="text-xs text-destructive">{requiredErrors.name}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Input {...fi("category")} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Input {...fi("unit")} />
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input type="number" {...fnum("currentStock")} />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input type="number" {...fnum("reorderLevel")} />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input {...fi("location")} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price</Label>
              <Input type="number" {...fnum("unitPrice")} step="0.01" />
            </div>
          </div>
          <DialogFooter>
                          <Button onClick={() => setOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Saving…" : "Update spare"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

function ImportSparesDialog() {
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
        tableName="stores_spares"
        endpoint="/stores/spares/bulk"
        onSuccess={() => qc.invalidateQueries({ queryKey: ["spare-items"] })}
        title="Import Spares"
      />
    </>
  );
}

function ReceiveStockButton({ item }: { item: any }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ quantityReceived: 0, supplier: "", notes: "" });

  const allFilled = form.quantityReceived > 0;

  const m = useMutation({
    mutationFn: () =>
      storesApi.receiveStock(item.id, {
        quantity_received: form.quantityReceived,
        supplier: form.supplier,
        notes: form.notes,
      }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (form.quantityReceived <= 0) errors.quantityReceived = "Must be greater than 0";
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, {
      onSuccess: () => {
        toast.success("Stock received");
        qc.invalidateQueries({ queryKey: ["spare-items"] });
        setForm({ quantityReceived: 0, supplier: "", notes: "" });
        setOpen(false);
      },
    });
  };

  useEffect(() => {
    if (open) {
      setForm({ quantityReceived: 0, supplier: "", notes: "" });
      setRequiredErrors({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Package className="size-3.5 mr-1" />
          Receive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Receive Stock — {item.code}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>
              Quantity Received <span className="text-destructive">*</span>
            </Label>
            <Input
              type="number"
              min={1}
              value={form.quantityReceived || ""}
              onChange={(e) => {
                setForm({ ...form, quantityReceived: +e.target.value });
                setRequiredErrors((p) => ({ ...p, quantityReceived: "" }));
              }}
              className={requiredErrors.quantityReceived ? "border-destructive" : ""}
            />
            {requiredErrors.quantityReceived && (
              <p className="text-xs text-destructive">{requiredErrors.quantityReceived}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Input
              value={form.supplier}
              onChange={(e) => setForm({ ...form, supplier: e.target.value })}
              placeholder="Supplier name"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Any remarks…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={m.isPending || !allFilled}>
              {m.isPending ? "Receiving…" : "Receive stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

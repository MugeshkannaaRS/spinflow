import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { storesApi, uploadApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { canWrite } from "@/lib/rbac";
import { AccessGuard } from "@/components/AccessGuard";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { FileUpload, type UploadedFile } from "@/components/ui/file-upload";
import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { ImportButton } from "@/components/ui/ImportButton";
import type { ColDef } from "@/components/ui/DataTable";
import { toast } from "sonner";
import { Plus, Warehouse, AlertTriangle, Package } from "lucide-react";
import { useColumnConfig } from "@/hooks/useColumnConfig";

export const Route = createFileRoute("/_app/stores")({
  head: () => ({ meta: [{ title: "Stores — SpinFlow ERP" }] }),
  component: StoresPage,
});

function StoresPage() {
  const user = useAuth((s) => s.user);
  const canEdit = canWrite(user?.role ?? "OPERATOR", "stores");
  const itemsQ = useQuery({ queryKey: ["spare-items"], queryFn: storesApi.getSpares, staleTime: 60_000, retry: 1 });
  const issuesQ = useQuery({ queryKey: ["issue-notes"], queryFn: storesApi.getIssues, staleTime: 60_000, retry: 1 });

  const items: any[] = itemsQ.data ?? [];
  const issues: any[] = issuesQ.data ?? [];

  const totalItems = items.length;
  const lowStockItems = items.filter((i) => i.stock <= i.minStock).length;
  const totalStock = items.reduce((s, i) => s + (i.stock ?? 0), 0);
  const reorderItems = items.filter((i) => i.stock < i.minStock * 0.5).length;

  const spareColConfig = useColumnConfig("stores_spares");
  const issueColConfig = useColumnConfig("stores_issues");

  if (!user) return null;
  if (itemsQ.isLoading) return (<><Topbar title="Stores & Spares" subtitle="Loading..." /><div className="p-6 text-sm text-muted-foreground">Loading data…</div></>);
  if (itemsQ.isError) return (<><Topbar title="Stores & Spares" subtitle="Error" /><div className="p-6 text-sm text-destructive">Error loading data.</div></>);

  const itemCols: ColDef[] = [
    { key: "code", label: spareColConfig.getLabel('code'), className: "font-mono text-xs" },
    { key: "name", label: spareColConfig.getLabel('name'), render: (i: any) => <span className="font-medium">{i.name}</span> },
    { key: "category", label: spareColConfig.getLabel('category'), type: "status", render: (i: any) => <Badge variant="outline">{i.category}</Badge> },
    { key: "stock", label: spareColConfig.getLabel('stock'), render: (i: any) => <span className="font-medium">{i.stock}</span> },
    { key: "minStock", label: spareColConfig.getLabel('minStock'), className: "text-muted-foreground" },
    { key: "unit", label: spareColConfig.getLabel('unit'), type: "status" },
    { key: "location", label: spareColConfig.getLabel('location') },
    { key: "vendor", label: spareColConfig.getLabel('vendor') },
    {
      key: "status", label: spareColConfig.getLabel('status'), type: "status", filterable: false,
      render: (i: any) => i.stock <= i.minStock ? (
        <Badge variant={i.stock < i.minStock * 0.5 ? "destructive" : "secondary"}>
          {i.stock < i.minStock * 0.5 ? "Reorder" : "Low"}
        </Badge>
      ) : <Badge variant="default">OK</Badge>,
    },
  ];

  const issueCols: ColDef[] = [
    { key: "date", label: issueColConfig.getLabel('date'), type: "date" },
    { key: "itemCode", label: issueColConfig.getLabel('itemCode'), className: "font-mono text-xs" },
    { key: "quantity", label: issueColConfig.getLabel('quantity') },
    { key: "issuedTo", label: issueColConfig.getLabel('issuedTo') },
    { key: "department", label: issueColConfig.getLabel('department'), type: "status" },
    { key: "purpose", label: issueColConfig.getLabel('purpose'), className: "max-w-xs truncate" },
    { key: "issuedBy", label: issueColConfig.getLabel('issuedBy') },
  ];

  return (
    <>
      <Topbar title="Stores & Spares" subtitle="Spare inventory, reorder alerts, issue notes & vendor management" />
      <AccessGuard module="stores">
        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Spare Items</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Package className="size-5 text-primary" />{totalItems}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Total Stock</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Warehouse className="size-5 text-green-600" />{totalStock} units</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Low Stock Items</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><AlertTriangle className="size-5 text-amber-500" />{lowStockItems}</div></CardContent></Card>
            <Card><CardContent className="p-5"><div className="text-xs uppercase text-muted-foreground font-medium">Needs Reorder</div><div className="text-2xl font-semibold mt-2">{reorderItems}</div></CardContent></Card>
          </div>

          <Tabs defaultValue="inventory">
            <TabsList>
              <TabsTrigger value="inventory">Spare Inventory</TabsTrigger>
              <TabsTrigger value="issues">Issue Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory">
              <Card>
                <CardHeader><CardTitle className="text-base">Spare Parts & Consumables</CardTitle></CardHeader>
                <CardContent>
                  <DataTable
                    tableId="stores_spares"
                    columns={itemCols}
                    data={items}
                    loading={itemsQ.isLoading}
                    rowKey={(i) => i.id}
                    exportFilename="spare_inventory"
                    toolbar={
                      canEdit ? (
                        <ImportButton
                          label="Import"
                          endpoint="/stores/spares/bulk"
                          templateCols={[
                            { key: "item_code", label: "Spare Code", required: true, candidates: ["code", "spare code", "item code"] },
                            { key: "name", label: "Name", required: true, candidates: ["name", "item name", "spare name"] },
                            { key: "category", label: "Category", required: true, candidates: ["category", "type"] },
                            { key: "unit", label: "Unit", required: true, candidates: ["unit", "uom"] },
                            { key: "reorder_level", label: "Min Stock", type: "number", candidates: ["min stock", "reorder", "minimum"] },
                            { key: "current_stock", label: "Max Stock", type: "number", candidates: ["max stock", "stock", "quantity"] },
                          ]}
                          exampleRow={{ item_code: "SP001", name: "Bearing 6205", category: "Bearings", unit: "Nos", reorder_level: "5", current_stock: "20" }}
                          onSuccess={() => itemsQ.refetch()}
                        />
                      ) : undefined
                    }
                  />
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
                  <DataTable tableId="stores_issues" columns={issueCols} data={issues} loading={issuesQ.isLoading} rowKey={(n) => n.id} exportFilename="issue_notes" />
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
  const [requiredErrors, setRequiredErrors] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const issueColConfig = useColumnConfig("stores_issues");
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), itemCode: "", itemName: "", quantity: 0, issuedTo: "", department: "", purpose: "", issuedBy: "" });

  const reqFields = ["date", "itemCode", "itemName", "quantity", "issuedTo", "department", "issuedBy"] as const;
  const allFilled = reqFields.every((f) => { const v = (form as any)[f]; return typeof v === "number" ? v > 0 : typeof v === "string" && v.trim().length > 0; });

  const m = useMutation({
    mutationFn: async () => {
      const entry = await storesApi.createIssue(form);
      if (files.length > 0) await Promise.all(files.map((f) => uploadApi.upload("stores_issue", entry.id, f.file)));
      return entry;
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    reqFields.forEach((f) => { const v = (form as any)[f]; if (typeof v === "number" ? v <= 0 : !v || !v.trim()) errors[f] = "Required"; });
    setRequiredErrors(errors);
    if (Object.keys(errors).length > 0) return;
    m.mutate(undefined, { onSuccess: () => { toast.success("Issue note created"); qc.invalidateQueries({ queryKey: ["issue-notes"] }); qc.invalidateQueries({ queryKey: ["spare-items"] }); setFiles([]); setOpen(false); } });
  };

  const fi = (key: keyof typeof form, type?: string) => ({
    value: String((form as any)[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [key]: type === "number" ? +e.target.value : e.target.value }); setRequiredErrors((p) => ({ ...p, [key]: "" })); },
    className: requiredErrors[key as string] ? "border-destructive" : "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" />New issue</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New issue note</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(["date", "itemCode", "itemName", "issuedTo", "department", "issuedBy"] as const).map((key) => (
              <div key={key} className="space-y-1.5">
                <Label>{issueColConfig.getLabel(key)} <span className="text-destructive">*</span></Label>
                <Input type={key === "date" ? "date" : "text"} {...fi(key)} />
                {requiredErrors[key] && <p className="text-xs text-destructive">{requiredErrors[key]}</p>}
              </div>
            ))}
            <div className="space-y-1.5">
              <Label>{issueColConfig.getLabel('quantity')} <span className="text-destructive">*</span></Label>
              <Input type="number" {...fi("quantity", "number")} />
              {requiredErrors.quantity && <p className="text-xs text-destructive">{requiredErrors.quantity}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{issueColConfig.getLabel('purpose')}</Label>
              <Input value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Attachment</Label>
              <FileUpload files={files} onFilesChange={setFiles} multiple={false} />
            </div>
          </div>
          <DialogFooter><Button type="submit" disabled={m.isPending || !allFilled}>{m.isPending ? "Saving…" : "Create issue note"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

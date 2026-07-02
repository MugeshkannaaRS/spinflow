import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseApi, storesApi } from "@/lib/api-service";
import { loadJsPDF, loadAutoTable } from "@/lib/export-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, FileDown, Ship, ClipboardList, Pencil, Wrench } from "lucide-react";
import { toast } from "sonner";

const MILL_NAME = "AA Yarn Mills Limited";
const MILL_ADDR = "Nagar Howla, Zaina Bazar, Sreepur PS, Gazipur-1740, Bangladesh";

function num(v: any): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function fmtN(v: any, d = 2): string { return num(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }

// ══════════════════════════════════════════════════════════════════════════════
// Cotton Imports (L/C consignments)
// ══════════════════════════════════════════════════════════════════════════════
export function CottonImportsTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["purchase", "imports"],
    queryFn: () => purchaseApi.getImports(),
  });
  const del = useMutation({
    mutationFn: (id: string) => purchaseApi.deleteImport(id),
    onSuccess: () => { toast.success("Import deleted"); qc.invalidateQueries({ queryKey: ["purchase", "imports"] }); },
    onError: () => toast.error("Delete failed"),
  });

  async function printImport(row: any) {
    try {
      const jspdf = await loadJsPDF(); await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(14); doc.text(MILL_NAME, 105, 16, { align: "center" });
      doc.setFontSize(8); doc.text(MILL_ADDR, 105, 21, { align: "center" });
      doc.setFontSize(13); doc.text("Cotton Import — Consignment Summary", 105, 30, { align: "center" });
      const L: [string, string][] = [
        ["Commercial Invoice", row.commercial_invoice_no || "-"],
        ["Invoice Date", row.date || "-"],
        ["Contract / PI", `${row.contract_no || "-"}${row.proforma_ref ? " / " + row.proforma_ref : ""}`],
        ["Supplier", `${row.supplier_name || "-"}${row.supplier_country ? ", " + row.supplier_country : ""}`],
        ["Applicant", row.applicant || "-"],
        ["Origin", row.origin || "-"],
        ["Description", row.description || "-"],
        ["Crop / Grade", `${row.crop_year || "-"} / ${row.grade || "-"}`],
        ["Quality", `Staple ${row.staple || "-"} · Mic ${row.micronaire || "-"} · Str ${row.strength || "-"}`],
        ["Bales", String(row.total_bales ?? 0)],
        ["Weight (kg)", `Gross ${fmtN(row.gross_kg)} · Tare ${fmtN(row.tare_kg)} · Net ${fmtN(row.net_kg)}`],
        ["Equivalent lbs", fmtN(row.equiv_lbs)],
        ["Unit Price", `${fmtN(row.unit_price, 4)} ${row.unit_uom || ""}`],
        ["FOB / Freight / Total (USD)", `${fmtN(row.fob_usd)} / ${fmtN(row.freight_usd)} / ${fmtN(row.total_usd)}`],
        ["HS Code", row.hs_code || "-"],
        ["L/C No / Date", `${row.lc_no || "-"}${row.lc_date ? " / " + row.lc_date : ""}`],
        ["B/L / Vessel", `${row.bl_no || "-"} / ${row.vessel || "-"}`],
        ["Route", `${row.shipped_from || "-"} → ${row.shipped_to || "-"}`],
        ["Trade Terms", row.trade_terms || "-"],
        ["Container Split", row.container_split || "-"],
        ["Status", row.status || "-"],
      ];
      (doc as any).autoTable({
        startY: 36, theme: "grid",
        body: L, columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
        styles: { fontSize: 9, cellPadding: 1.8 },
      });
      doc.save(`Cotton_Import_${row.commercial_invoice_no || row.id}.pdf`);
    } catch { toast.error("PDF failed"); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Ship className="size-4" /> Cotton Imports (L/C)</CardTitle>
        {canEdit && <Button size="sm" onClick={() => { setEditRow(null); setDlgOpen(true); }}><Plus className="size-3.5 mr-1" /> New Import</Button>}
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[900px]">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
                <TableHead>Origin</TableHead><TableHead className="text-right">Bales</TableHead>
                <TableHead className="text-right">Net kg</TableHead><TableHead className="text-right">¢/lb</TableHead>
                <TableHead className="text-right">Total USD</TableHead><TableHead>L/C No</TableHead>
                <TableHead>Status</TableHead><TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No cotton imports yet.</TableCell></TableRow>
              ) : data.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.commercial_invoice_no}</TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{row.supplier_name}</TableCell>
                  <TableCell>{row.origin || "-"}</TableCell>
                  <TableCell className="text-right">{row.total_bales}</TableCell>
                  <TableCell className="text-right">{fmtN(row.net_kg)}</TableCell>
                  <TableCell className="text-right">{fmtN(row.unit_price, 2)}</TableCell>
                  <TableCell className="text-right">{fmtN(row.total_usd)}</TableCell>
                  <TableCell className="font-mono text-xs">{row.lc_no || "-"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{row.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print" onClick={() => printImport(row)}><FileDown className="size-3.5" /></Button>
                      {canEdit && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => { setEditRow(row); setDlgOpen(true); }}><Pencil className="size-3.5" /></Button>}
                      {canEdit && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="Delete" onClick={() => { if (confirm("Delete this import?")) del.mutate(row.id); }}><Trash2 className="size-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {dlgOpen && <ImportDialog editRow={editRow} onClose={() => setDlgOpen(false)} />}
    </Card>
  );
}

function ImportDialog({ editRow, onClose }: { editRow: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!editRow;
  const base = {
    date: new Date().toISOString().slice(0, 10), commercial_invoice_no: "", contract_no: "", proforma_ref: "",
    supplier_name: "", supplier_country: "", applicant: "", origin: "", description: "", crop_year: "",
    grade: "", staple: "", micronaire: "", strength: "", total_bales: "", gross_kg: "", tare_kg: "", net_kg: "",
    equiv_lbs: "", unit_price: "", unit_uom: "cents/lb", fob_usd: "", freight_usd: "", total_usd: "", hs_code: "",
    lc_no: "", lc_date: "", bl_no: "", vessel: "", shipped_from: "", shipped_to: "", trade_terms: "",
    container_split: "", status: "in-transit", remarks: "",
  };
  const [f, setF] = useState<Record<string, string>>(() => {
    if (!editRow) return base;
    const o: Record<string, string> = { ...base };
    for (const k of Object.keys(base)) o[k] = editRow[k] == null ? "" : String(editRow[k]);
    return o;
  });
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: (data: any) => isEdit ? purchaseApi.updateImport(editRow.id, data) : purchaseApi.createImport(data),
    onSuccess: () => { toast.success(isEdit ? "Import updated" : "Cotton import saved"); qc.invalidateQueries({ queryKey: ["purchase", "imports"] }); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Save failed"),
  });

  const submit = () => {
    if (!f.commercial_invoice_no.trim() || !f.supplier_name.trim()) { toast.error("Invoice no. and supplier are required"); return; }
    const numeric = ["total_bales", "gross_kg", "tare_kg", "net_kg", "equiv_lbs", "unit_price", "fob_usd", "freight_usd", "total_usd"];
    const payload: any = { ...f };
    for (const k of numeric) payload[k] = f[k] === "" ? 0 : Number(f[k]);
    if (!f.lc_date) payload.lc_date = null;
    mut.mutate(payload);
  };

  const Field = ({ k, label, type = "text", ph = "" }: { k: string; label: string; type?: string; ph?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type={type} value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="h-8 text-sm" />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? `Edit Import — ${editRow.commercial_invoice_no}` : "New Cotton Import (L/C)"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Invoice & parties</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field k="commercial_invoice_no" label="Commercial Invoice No *" ph="24920" />
              <Field k="date" label="Invoice Date" type="date" />
              <Field k="contract_no" label="Contract No" ph="CDI-S 15673" />
              <Field k="proforma_ref" label="Proforma Ref" />
              <Field k="supplier_name" label="Supplier *" ph="StoneX Switzerland SA" />
              <Field k="supplier_country" label="Supplier Country" ph="Switzerland" />
              <Field k="applicant" label="Applicant / Buyer" ph="AA Yarn Mills Ltd" />
              <Field k="origin" label="Origin" ph="Ivory Coast" />
              <Field k="hs_code" label="HS Code" ph="5201.00.00" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Goods & quality</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field k="description" label="Description" ph="Raw Cotton" />
              <Field k="crop_year" label="Crop Year" ph="25/26" />
              <Field k="grade" label="Grade" ph="Strict Middling" />
              <Field k="staple" label="Staple" ph='1-5/32"' />
              <Field k="micronaire" label="Micronaire" ph="3.8-4.9" />
              <Field k="strength" label="Strength (GPT)" ph="29 min" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Quantity & pricing</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field k="total_bales" label="Bales" type="number" ph="1320" />
              <Field k="gross_kg" label="Gross kg" type="number" />
              <Field k="tare_kg" label="Tare kg" type="number" />
              <Field k="net_kg" label="Net kg" type="number" />
              <Field k="equiv_lbs" label="Equivalent lbs" type="number" />
              <Field k="unit_price" label="Unit Price" type="number" ph="91.56" />
              <Field k="unit_uom" label="UoM" ph="cents/lb" />
              <Field k="fob_usd" label="FOB (USD)" type="number" />
              <Field k="freight_usd" label="Freight (USD)" type="number" />
              <Field k="total_usd" label="Total CFR (USD)" type="number" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Trade & shipping</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field k="lc_no" label="L/C No" ph="0000168026020050" />
              <Field k="lc_date" label="L/C Date" type="date" />
              <Field k="bl_no" label="B/L No" />
              <Field k="vessel" label="Vessel" />
              <Field k="shipped_from" label="Shipped From" ph="Santos, Brazil" />
              <Field k="shipped_to" label="Shipped To" ph="Chattogram" />
              <Field k="trade_terms" label="Trade Terms" ph="CFR Chattogram (Incoterms 2020)" />
              <Field k="container_split" label="Container Split" ph='{"AAYML":6,"MSA":6}' />
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={f.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-transit">In transit</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="cleared">Cleared</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? "Saving…" : isEdit ? "Update Import" : "Save Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Work Orders
// ══════════════════════════════════════════════════════════════════════════════
export function WorkOrdersTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["purchase", "work-orders"],
    queryFn: () => purchaseApi.getWorkOrders(),
  });
  const del = useMutation({
    mutationFn: (id: string) => purchaseApi.deleteWorkOrder(id),
    onSuccess: () => { toast.success("Work order deleted"); qc.invalidateQueries({ queryKey: ["purchase", "work-orders"] }); },
    onError: () => toast.error("Delete failed"),
  });

  async function printWO(wo: any) {
    try {
      const jspdf = await loadJsPDF(); await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(15); doc.text(MILL_NAME, 105, 16, { align: "center" });
      doc.setFontSize(8); doc.text(MILL_ADDR, 105, 21, { align: "center" });
      doc.setFontSize(13); doc.text(wo.subject || "Work Order", 105, 30, { align: "center" });
      doc.setFontSize(9);
      doc.text(`Ref No: ${wo.wo_no}`, 14, 40);
      doc.text(`Date: ${wo.date}`, 196, 40, { align: "right" });
      let y = 47;
      doc.text("To:", 14, y);
      doc.setFont(undefined, "bold"); doc.text(wo.supplier_name || "", 22, y); doc.setFont(undefined, "normal");
      if (wo.supplier_address) { y += 5; doc.text(String(wo.supplier_address), 22, y); }
      if (wo.attn_person) { y += 5; doc.text(`Attn: ${wo.attn_person}`, 22, y); }
      if (wo.for_machine) { y += 5; doc.text(`For machine: ${wo.for_machine}`, 22, y); }
      y += 8;
      (doc as any).autoTable({
        startY: y, theme: "grid",
        head: [["SL", "Item Description", "Unit", "Qty", "Unit Price", "Total Amount"]],
        body: (wo.items || []).map((it: any) => [
          String(it.sl_no),
          it.description + (it.spare_code ? ` [${it.spare_code}]` : ""),
          it.unit || "", fmtN(it.qty, 0), fmtN(it.unit_price), fmtN(it.amount),
        ]),
        foot: [["", "", "", "", "Net Payable", `${wo.currency || ""} ${fmtN(wo.net_payable)}`]],
        styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [37, 99, 235] },
        footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold" },
      });
      let yy = (doc as any).lastAutoTable.finalY + 6;
      if (wo.amount_in_words) { doc.setFontSize(9); doc.text(`In Words: ${wo.amount_in_words}`, 14, yy); yy += 8; }
      if (wo.terms) {
        doc.setFont(undefined, "bold"); doc.text("Terms & Conditions:", 14, yy); doc.setFont(undefined, "normal"); yy += 5;
        const lines = doc.splitTextToSize(String(wo.terms), 180);
        doc.setFontSize(8.5); doc.text(lines, 14, yy); yy += lines.length * 4.5 + 6;
      }
      if (wo.contact_person) { doc.setFontSize(9); doc.text(`Contact: ${wo.contact_person}${wo.contact_phone ? " · " + wo.contact_phone : ""}`, 14, yy); yy += 12; }
      doc.text(wo.prepared_by ? `Prepared by: ${wo.prepared_by}` : "Prepared by", 14, yy + 6);
      doc.text(wo.authorised_by ? `Authorised: ${wo.authorised_by}` : "Authorised Signature", 196, yy + 6, { align: "right" });
      doc.save(`WorkOrder_${String(wo.wo_no).replace(/[^\w]+/g, "_")}.pdf`);
    } catch { toast.error("PDF failed"); }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><ClipboardList className="size-4" /> Work Orders</CardTitle>
        {canEdit && <Button size="sm" onClick={() => { setEditRow(null); setDlgOpen(true); }}><Plus className="size-3.5 mr-1" /> New Work Order</Button>}
      </CardHeader>
      <CardContent>
        <div className="w-full overflow-x-auto">
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead>WO No</TableHead><TableHead>Date</TableHead><TableHead>Supplier</TableHead>
                <TableHead>For / Subject</TableHead><TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Net Payable</TableHead><TableHead>Status</TableHead><TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No work orders yet.</TableCell></TableRow>
              ) : data.map((wo: any) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-mono text-xs font-medium">{wo.wo_no}</TableCell>
                  <TableCell>{wo.date}</TableCell>
                  <TableCell className="max-w-[160px] truncate">{wo.supplier_name}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{wo.for_machine || wo.subject}</TableCell>
                  <TableCell className="text-right">{(wo.items || []).length}</TableCell>
                  <TableCell className="text-right">{wo.currency} {fmtN(wo.net_payable)}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{wo.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Print WO" onClick={() => printWO(wo)}><FileDown className="size-3.5" /></Button>
                      {canEdit && <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => { setEditRow(wo); setDlgOpen(true); }}><Pencil className="size-3.5" /></Button>}
                      {canEdit && <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="Delete" onClick={() => { if (confirm("Delete this work order?")) del.mutate(wo.id); }}><Trash2 className="size-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {dlgOpen && <WorkOrderDialog editRow={editRow} onClose={() => setDlgOpen(false)} />}
    </Card>
  );
}

type WOItem = { sl_no: number; description: string; unit: string; qty: string; unit_price: string; spare_id?: string; spare_code?: string };

function WorkOrderDialog({ editRow, onClose }: { editRow: any | null; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!editRow;
  const baseHead = {
    wo_no: "", date: new Date().toISOString().slice(0, 10), supplier_name: "", supplier_address: "",
    attn_person: "", subject: "Work Order", currency: "BDT", amount_in_words: "", terms: "",
    contact_person: "", contact_phone: "", prepared_by: "", authorised_by: "", for_machine: "",
  };
  const [h, setH] = useState<Record<string, string>>(() => {
    if (!editRow) return baseHead;
    const o: Record<string, string> = { ...baseHead };
    for (const k of Object.keys(baseHead)) o[k] = editRow[k] == null ? "" : String(editRow[k]);
    return o;
  });
  const [items, setItems] = useState<WOItem[]>(() => {
    if (editRow?.items?.length) return editRow.items.map((it: any, i: number) => ({
      sl_no: i + 1, description: it.description ?? "", unit: it.unit ?? "Pcs",
      qty: it.qty != null ? String(it.qty) : "", unit_price: it.unit_price != null ? String(it.unit_price) : "",
      spare_id: it.spare_id ?? undefined, spare_code: it.spare_code ?? undefined,
    }));
    return [{ sl_no: 1, description: "", unit: "Pcs", qty: "", unit_price: "" }];
  });
  const setHead = (k: string, v: string) => setH((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, k: keyof WOItem, v: string) => setItems((p) => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItems((p) => [...p, { sl_no: p.length + 1, description: "", unit: "Pcs", qty: "", unit_price: "" }]);
  const rmItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i).map((it, idx) => ({ ...it, sl_no: idx + 1 })));
  const netPayable = items.reduce((a, it) => a + num(it.qty) * num(it.unit_price), 0);

  // Spares master for "add from spares"
  const { data: spares = [] } = useQuery({ queryKey: ["stores", "spares"], queryFn: () => storesApi.getSpares() });
  const addSpareLine = (spareId: string) => {
    const sp = spares.find((s: any) => s.id === spareId);
    if (!sp) return;
    setItems((p) => [...p, {
      sl_no: p.length + 1, description: sp.name || sp.code, unit: sp.unit || "Pcs",
      qty: "", unit_price: "", spare_id: sp.id, spare_code: sp.code,
    }]);
  };

  const mut = useMutation({
    mutationFn: (data: any) => isEdit ? purchaseApi.updateWorkOrder(editRow.id, data) : purchaseApi.createWorkOrder(data),
    onSuccess: () => { toast.success(isEdit ? "Work order updated" : "Work order saved"); qc.invalidateQueries({ queryKey: ["purchase", "work-orders"] }); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Save failed"),
  });

  const submit = () => {
    if (!h.wo_no.trim() || !h.supplier_name.trim()) { toast.error("WO No. and supplier are required"); return; }
    const cleanItems = items.filter((it) => it.description.trim()).map((it) => ({
      sl_no: it.sl_no, description: it.description.trim(), unit: it.unit,
      qty: num(it.qty), unit_price: num(it.unit_price), spare_id: it.spare_id ?? null, spare_code: it.spare_code ?? null,
    }));
    if (cleanItems.length === 0) { toast.error("Add at least one line item"); return; }
    mut.mutate({ ...h, items: cleanItems });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? `Edit Work Order — ${editRow.wo_no}` : "New Work Order"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs">WO No *</Label><Input value={h.wo_no} onChange={(e) => setHead("wo_no", e.target.value)} placeholder="AAYML/W.O/2026/182" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Date</Label><Input type="date" value={h.date} onChange={(e) => setHead("date", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Subject</Label><Input value={h.subject} onChange={(e) => setHead("subject", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Supplier *</Label><Input value={h.supplier_name} onChange={(e) => setHead("supplier_name", e.target.value)} placeholder="Texcorp Trading Ltd." className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Attn</Label><Input value={h.attn_person} onChange={(e) => setHead("attn_person", e.target.value)} placeholder="Manager (Spares)" className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Supplier Address</Label><Input value={h.supplier_address} onChange={(e) => setHead("supplier_address", e.target.value)} placeholder="117/A, Tejgaon I/A, Dhaka-1208" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs flex items-center gap-1"><Wrench className="size-3" /> For machine</Label><Input value={h.for_machine} onChange={(e) => setHead("for_machine", e.target.value)} placeholder="Ring Frame #12" className="h-8 text-sm" /></div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <p className="text-xs font-semibold text-muted-foreground">Line items</p>
              <div className="flex gap-1.5 items-center">
                {spares.length > 0 && (
                  <Select value="" onValueChange={addSpareLine}>
                    <SelectTrigger className="h-7 text-xs w-44"><SelectValue placeholder="+ Add from spares" /></SelectTrigger>
                    <SelectContent>
                      {spares.slice(0, 200).map((s: any) => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">{s.code} — {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addItem}><Plus className="size-3 mr-1" /> Add line</Button>
              </div>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Input value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Item description" className="h-8 text-sm" />
                    {it.spare_code && <span className="text-[10px] text-emerald-700 flex items-center gap-0.5 mt-0.5"><Wrench className="size-2.5" /> spare {it.spare_code}</span>}
                  </div>
                  <Input value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} placeholder="Pcs" className="h-8 text-sm col-span-1" />
                  <Input type="number" value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} placeholder="Qty" className="h-8 text-sm col-span-2" />
                  <Input type="number" value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} placeholder="Unit price" className="h-8 text-sm col-span-2" />
                  <div className="col-span-1 text-right text-xs font-medium">{fmtN(num(it.qty) * num(it.unit_price))}</div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 col-span-1 text-red-500" onClick={() => rmItem(i)} disabled={items.length === 1}><Trash2 className="size-3.5" /></Button>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-2 text-sm font-semibold">Net Payable: {h.currency} {fmtN(netPayable)}</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1"><Label className="text-xs">Currency</Label><Input value={h.currency} onChange={(e) => setHead("currency", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2"><Label className="text-xs">Amount in words</Label><Input value={h.amount_in_words} onChange={(e) => setHead("amount_in_words", e.target.value)} placeholder="Taka Fifty Seven Thousand Three Hundred Only" className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Contact person</Label><Input value={h.contact_person} onChange={(e) => setHead("contact_person", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Contact phone</Label><Input value={h.contact_phone} onChange={(e) => setHead("contact_phone", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Prepared by</Label><Input value={h.prepared_by} onChange={(e) => setHead("prepared_by", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1"><Label className="text-xs">Authorised by</Label><Input value={h.authorised_by} onChange={(e) => setHead("authorised_by", e.target.value)} className="h-8 text-sm" /></div>
            <div className="space-y-1 col-span-2 sm:col-span-3"><Label className="text-xs">Terms & Conditions</Label><Input value={h.terms} onChange={(e) => setHead("terms", e.target.value)} placeholder="Delivery to factory; payment by A/C payee cheque on delivery…" className="h-8 text-sm" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? "Saving…" : isEdit ? "Update Work Order" : "Save Work Order"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

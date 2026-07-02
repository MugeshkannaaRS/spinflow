import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dispatchApi } from "@/lib/api-service";
import { loadJsPDF, loadAutoTable } from "@/lib/export-utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, FileDown } from "lucide-react";
import { toast } from "sonner";

const MILL_NAME = "AA Yarn Mills Limited";
const MILL_ADDR = "Nagar Howla, Zaina Bazar, Sreepur PS, Gazipur-1740, Bangladesh";

function num(v: any): number { const n = Number(v); return isNaN(n) ? 0 : n; }
function fmtN(v: any, d = 2): string { return num(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }); }

const DOC_FIELDS = [
  "consignee_address", "item_specification", "material_description", "grade", "unit", "pi_do_no",
  "total_bags", "gross_weight_kg", "tare_weight_kg", "weight_serial", "gate_pass_no", "prepared_by", "remarks",
];

/** Per-order button that opens a dialog to fill the Challan/Gate Pass/Weight Report
 *  fields and print all three on the AA Yarn Mills formats. */
export function DispatchDocsButton({ order, canEdit }: { order: any; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const init = () => {
    const o: Record<string, string> = {};
    for (const k of DOC_FIELDS) o[k] = order[k] == null ? "" : String(order[k]);
    if (!o.unit) o.unit = "KG";
    return o;
  };
  const [f, setF] = useState<Record<string, string>>(init);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload: any = { ...f };
      for (const k of ["total_bags", "gross_weight_kg", "tare_weight_kg"]) payload[k] = f[k] === "" ? null : Number(f[k]);
      return dispatchApi.updateDocuments(order.id, payload);
    },
    onSuccess: () => { toast.success("Document details saved"); qc.invalidateQueries({ queryKey: ["dispatch-orders"] }); },
    onError: (e: any) => toast.error(e?.response?.data?.detail ?? "Save failed"),
  });

  // merged view: latest form values over the order record
  const D = () => ({ ...order, ...f, net_weight_kg: num(f.gross_weight_kg) - num(f.tare_weight_kg) });

  function header(doc: any, title: string) {
    doc.setFontSize(15); doc.text(MILL_NAME, 105, 15, { align: "center" });
    doc.setFontSize(8); doc.text(MILL_ADDR, 105, 20, { align: "center" });
    doc.setFontSize(13); doc.setFont(undefined, "bold");
    doc.text(title, 105, 29, { align: "center" });
    doc.setLineWidth(0.3); doc.line(88, 31, 122, 31);
    doc.setFont(undefined, "normal");
  }

  function signRow(doc: any, y: number, labels: string[]) {
    const w = 190 / labels.length;
    doc.setFontSize(8);
    labels.forEach((lab, i) => {
      const x = 14 + w * i;
      doc.line(x, y, x + w - 8, y);
      doc.text(lab, x, y + 4);
    });
  }

  async function printChallanOrGatePass(kind: "challan" | "gatepass") {
    try {
      const jspdf = await loadJsPDF(); await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const d = D();
      header(doc, kind === "challan" ? "Delivery Challan" : "Gate Pass");
      doc.setFontSize(9);
      const docNo = kind === "challan" ? (d.dispatch_no || "") : (d.gate_pass_no || d.dispatch_no || "");
      doc.text(`${kind === "challan" ? "D/C No" : "Gate Pass No"}: ${docNo}`, 14, 40);
      doc.text(`Date: ${d.date || ""}`, 196, 40, { align: "right" });
      doc.text(`Truck No: ${d.vehicle_no || "-"}`, 14, 46);
      let y = 54;
      doc.text("To:", 14, y);
      doc.setFont(undefined, "bold"); doc.text(String(d.customer || ""), 22, y); doc.setFont(undefined, "normal");
      if (d.consignee_address) { y += 5; doc.text(String(d.consignee_address), 22, y); }
      y += 8;
      (doc as any).autoTable({
        startY: y, theme: "grid",
        head: [["SL", "Item Specification", "Grade", "Unit", "Lot No", "No of Bags", "Quantity", "PI/DO No"]],
        body: [[
          "1", d.item_specification || d.material_description || "-", d.grade || "-", d.unit || "-",
          d.lot_no || "-", String(d.total_bags ?? "-"), fmtN(d.quantity_kg ?? d.total_weight_kg, 0), d.pi_do_no || d.order_no || "-",
        ]],
        styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: [37, 99, 235] },
      });
      let yy = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(8);
      doc.text("Received the above in good condition for handling & Delivery.", 14, yy);
      yy += 4;
      doc.text("(Consignee will kindly sign here & return the duplicate to us)", 14, yy);
      yy += 18;
      signRow(doc, yy, ["Prepared By", "Goods Checked By", "Store Officer", "Authorised Signature"]);
      yy += 16;
      signRow(doc, yy, ["", "", "", "Consignee's Signature with Seal"]);
      doc.save(`${kind === "challan" ? "DeliveryChallan" : "GatePass"}_${String(docNo).replace(/[^\w]+/g, "_")}.pdf`);
    } catch { toast.error("PDF failed"); }
  }

  async function printWeightReport() {
    try {
      const jspdf = await loadJsPDF(); await loadAutoTable();
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const d = D();
      header(doc, "Weight Report");
      doc.setFontSize(9);
      const rows: [string, string][] = [
        ["Serial No", d.weight_serial || "-"],
        ["Date", d.date || "-"],
        ["Customer Name", d.customer || "-"],
        ["Material Description", d.material_description || d.item_specification || "-"],
        ["Quantity", String(d.total_bags ?? "-")],
        ["Truck No", d.vehicle_no || "-"],
        ["Driver Name", d.driver_name || "-"],
      ];
      (doc as any).autoTable({
        startY: 38, theme: "grid", body: rows,
        columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
        styles: { fontSize: 9, cellPadding: 2 },
      });
      let y = (doc as any).lastAutoTable.finalY + 8;
      (doc as any).autoTable({
        startY: y, theme: "grid",
        head: [["Gross Weight", "Tare Weight", "Net Weight"]],
        body: [[`${fmtN(d.gross_weight_kg)} kg`, `${fmtN(d.tare_weight_kg)} kg`, `${fmtN(d.net_weight_kg)} kg`]],
        styles: { fontSize: 11, cellPadding: 4, halign: "center" },
        headStyles: { fillColor: [37, 99, 235], halign: "center" },
      });
      let yy = (doc as any).lastAutoTable.finalY + 18;
      signRow(doc, yy, ["Driver Signature", "Customer Signature", "Security Signature", "Operator Signature"]);
      doc.save(`WeightReport_${String(d.weight_serial || d.dispatch_no).replace(/[^\w]+/g, "_")}.pdf`);
    } catch { toast.error("PDF failed"); }
  }

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Documents" onClick={() => { setF(init()); setOpen(true); }}>
        <FileText className="size-3.5 mr-1" /> Docs
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Dispatch Documents — {order.dispatch_no || order.order_no}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              {order.customer} · {order.date} · {order.vehicle_no || "no vehicle"} · Lot {order.lot_no || "-"}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1 col-span-2 sm:col-span-3"><Label className="text-xs">Consignee address</Label><Input value={f.consignee_address} onChange={(e) => set("consignee_address", e.target.value)} placeholder="Konabari, Gazipur" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Item specification</Label><Input value={f.item_specification} onChange={(e) => set("item_specification", e.target.value)} placeholder="Fabrics" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Material description</Label><Input value={f.material_description} onChange={(e) => set("material_description", e.target.value)} placeholder="Fabric" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Grade</Label><Input value={f.grade} onChange={(e) => set("grade", e.target.value)} placeholder="A" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Unit</Label><Input value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="KG" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">PI / DO No</Label><Input value={f.pi_do_no} onChange={(e) => set("pi_do_no", e.target.value)} placeholder="AAY260702" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">No of Bags</Label><Input type="number" value={f.total_bags} onChange={(e) => set("total_bags", e.target.value)} placeholder="236" className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Gate Pass No</Label><Input value={f.gate_pass_no} onChange={(e) => set("gate_pass_no", e.target.value)} className="h-8 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Prepared by</Label><Input value={f.prepared_by} onChange={(e) => set("prepared_by", e.target.value)} placeholder="Masud" className="h-8 text-sm" /></div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">Weighbridge</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Weight serial</Label><Input value={f.weight_serial} onChange={(e) => set("weight_serial", e.target.value)} placeholder="09484" className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Gross weight (kg)</Label><Input type="number" value={f.gross_weight_kg} onChange={(e) => set("gross_weight_kg", e.target.value)} placeholder="13950" className="h-8 text-sm" /></div>
                <div className="space-y-1"><Label className="text-xs">Tare weight (kg)</Label><Input type="number" value={f.tare_weight_kg} onChange={(e) => set("tare_weight_kg", e.target.value)} placeholder="7910" className="h-8 text-sm" /></div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Net weight: <span className="font-semibold">{fmtN(num(f.gross_weight_kg) - num(f.tare_weight_kg))} kg</span></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => printChallanOrGatePass("challan")}><FileDown className="size-3.5 mr-1" /> Delivery Challan</Button>
              <Button size="sm" variant="outline" onClick={() => printChallanOrGatePass("gatepass")}><FileDown className="size-3.5 mr-1" /> Gate Pass</Button>
              <Button size="sm" variant="outline" onClick={printWeightReport}><FileDown className="size-3.5 mr-1" /> Weight Report</Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            {canEdit && <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save details"}</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productionApi } from "@/lib/api-service";
import { useAuth } from "@/stores/auth";
import { useActiveMill } from "@/hooks/useActiveMill";
import { Button } from "@/components/ui/button";
import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { Printer, Save, ChevronLeft, Plus, Trash2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/production/learner-allocation")({
  head: () => ({ meta: [{ title: "Manpower Allocation — SpinFlow ERP" }] }),
  component: LearnerAllocationForm,
});

// ── Section definitions matching the paper form exactly ───────────────────────
const SECTIONS = [
  {
    key: "carding",
    label: "Carding",
    hasBColumn: false,
    defaultRows: [
      { machine_no: "01-08", sub_label: "" },
      { machine_no: "09-16", sub_label: "" },
      { machine_no: "17-24", sub_label: "" },
    ],
  },
  {
    key: "drawing",
    label: "Drawing",
    hasBColumn: false,
    defaultRows: [
      { machine_no: "B/D-01", sub_label: "" },
      { machine_no: "B/D-02", sub_label: "" },
      { machine_no: "B/D-03", sub_label: "" },
      { machine_no: "B/D-04", sub_label: "" },
      { machine_no: "B/D-05", sub_label: "" },
      { machine_no: "F/D-01", sub_label: "" },
      { machine_no: "F/D-02", sub_label: "" },
      { machine_no: "F/D-03", sub_label: "" },
    ],
  },
  {
    key: "simplex",
    label: "Simplex",
    hasBColumn: false,
    defaultRows: [
      { machine_no: "S/F-01", sub_label: "" },
      { machine_no: "S/F-02", sub_label: "" },
      { machine_no: "S/F-03", sub_label: "" },
      { machine_no: "S/F-04", sub_label: "" },
      { machine_no: "S/F-05", sub_label: "" },
      { machine_no: "S/F-06", sub_label: "" },
      { machine_no: "S/F-07", sub_label: "" },
      { machine_no: "S/F-08", sub_label: "" },
      { machine_no: "S/T",    sub_label: "" },
    ],
  },
  {
    key: "ring",
    label: "Ring Unit-A",
    hasBColumn: true,
    defaultRows: Array.from({ length: 26 }, (_, i) => ({ machine_no: String(i + 1), sub_label: "" })),
  },
  {
    key: "mc",
    label: "M.C.",
    hasBColumn: false,
    defaultRows: [
      { machine_no: "l/m",  sub_label: "" },
      { machine_no: "F/c",  sub_label: "" },
      { machine_no: "",     sub_label: "House Keeper" },
      { machine_no: "",     sub_label: "Oiling" },
      { machine_no: "",     sub_label: "Relieving" },
    ],
  },
  {
    key: "floor_cleaner",
    label: "Floor Cleaner",
    hasBColumn: false,
    defaultRows: [{ machine_no: "", sub_label: "" }],
  },
  {
    key: "finishing",
    label: "Finishing",
    hasBColumn: false,
    defaultRows: [
      { machine_no: "27", sub_label: "" },
      { machine_no: "30", sub_label: "" },
      { machine_no: "28", sub_label: "" },
      { machine_no: "32", sub_label: "" },
    ],
  },
  {
    key: "extra",
    label: "Extra",
    hasBColumn: false,
    defaultRows: [{ machine_no: "", sub_label: "" }, { machine_no: "", sub_label: "" }],
  },
];

type EntryRow = {
  id: string;
  section: string;
  machine_no: string;
  card_no_a: string;
  card_no_b: string;
  sub_label: string;
};

function makeRow(section: string, defaults: { machine_no: string; sub_label: string }): EntryRow {
  return {
    id: Math.random().toString(36).slice(2),
    section,
    machine_no: defaults.machine_no,
    card_no_a: "",
    card_no_b: "",
    sub_label: defaults.sub_label,
  };
}

function buildInitialRows(): EntryRow[] {
  return SECTIONS.flatMap((s) =>
    s.defaultRows.map((d) => makeRow(s.key, d))
  );
}

// ── Inline cell input ─────────────────────────────────────────────────────────
function Cell({
  value,
  onChange,
  placeholder = "",
  width = "w-16",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: string;
}) {
  return (
    <input
      className={`${width} border-b border-gray-300 bg-transparent text-center text-xs py-0.5 focus:outline-none focus:border-blue-500 print:border-gray-400`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

// ── One section table ─────────────────────────────────────────────────────────
function SectionTable({
  section,
  rows,
  onUpdate,
  onAdd,
  onDelete,
}: {
  section: (typeof SECTIONS)[0];
  rows: EntryRow[];
  onUpdate: (id: string, field: keyof EntryRow, value: string) => void;
  onAdd: (section: string) => void;
  onDelete: (id: string) => void;
}) {
  const filledCount = rows.filter((r) => r.card_no_a || r.card_no_b).length;

  return (
    <div className="section-block mb-4 break-inside-avoid">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-400 w-full pb-0.5 print:text-black">
          {section.label}
          <span className="ml-2 font-normal text-gray-400 print:hidden">
            Total: {filledCount}
          </span>
        </h3>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100 print:bg-transparent">
            <th className="text-left px-1 py-0.5 border border-gray-300 w-20 font-semibold">M/C No.</th>
            {section.key === "mc" && (
              <th className="text-left px-1 py-0.5 border border-gray-300 w-28 font-semibold">Type</th>
            )}
            <th className="text-center px-1 py-0.5 border border-gray-300 font-semibold">
              {section.hasBColumn ? "R/A Card No." : "Card No."}
            </th>
            {section.hasBColumn && (
              <th className="text-center px-1 py-0.5 border border-gray-300 font-semibold">R/B Card No.</th>
            )}
            <th className="w-6 print:hidden" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-blue-50/30 print:hover:bg-transparent">
              <td className="border border-gray-200 px-1 py-0.5">
                <Cell
                  value={row.machine_no}
                  onChange={(v) => onUpdate(row.id, "machine_no", v)}
                  width="w-full"
                />
              </td>
              {section.key === "mc" && (
                <td className="border border-gray-200 px-1 py-0.5">
                  <Cell
                    value={row.sub_label}
                    onChange={(v) => onUpdate(row.id, "sub_label", v)}
                    width="w-full"
                    placeholder="label"
                  />
                </td>
              )}
              <td className="border border-gray-200 px-1 py-0.5 text-center">
                <Cell
                  value={row.card_no_a}
                  onChange={(v) => onUpdate(row.id, "card_no_a", v)}
                />
              </td>
              {section.hasBColumn && (
                <td className="border border-gray-200 px-1 py-0.5 text-center">
                  <Cell
                    value={row.card_no_b}
                    onChange={(v) => onUpdate(row.id, "card_no_b", v)}
                  />
                </td>
              )}
              <td className="print:hidden px-0.5">
                <button
                  onClick={() => onDelete(row.id)}
                  className="text-gray-300 hover:text-red-400 p-0.5 rounded"
                >
                  <Trash2 className="size-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={section.hasBColumn ? 4 : section.key === "mc" ? 4 : 3}
                className="print:hidden pt-1">
              <button
                onClick={() => onAdd(section.key)}
                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 px-1"
              >
                <Plus className="size-3" /> Add row
              </button>
            </td>
            <td className="border-t border-gray-300 px-1 py-0.5 text-right text-[10px] font-semibold text-gray-600">
              Total: {filledCount}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────
function LearnerAllocationForm() {
  const user = useAuth((s) => s.user);
  const { millId } = useActiveMill();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const [allocationDate, setAllocationDate] = useState(today);
  const [shift, setShift] = useState("morning");
  const [allocationType, setAllocationType] = useState("P/c");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<EntryRow[]>(buildInitialRows);

  const createM = useMutation({
    mutationFn: (data: any) => productionApi.createLearnerAllocation(data),
    onSuccess: (res) => {
      toast.success("Learner allocation saved!");
      qc.invalidateQueries({ queryKey: ["learner-allocations"] });
      window.location.href = "/production/learner-allocations";
    },
    onError: (err: any) => toast.error(err?.response?.data?.detail ?? "Save failed"),
  });

  const updateRow = useCallback((id: string, field: keyof EntryRow, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }, []);

  const addRow = useCallback((section: string) => {
    setRows((prev) => [...prev, makeRow(section, { machine_no: "", sub_label: "" })]);
  }, []);

  const deleteRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const totalPersons = rows.filter((r) => r.card_no_a || r.card_no_b).length;

  const handleSave = () => {
    if (!allocationDate) { toast.error("Select a date"); return; }
    const entries = rows.map((r, i) => ({
      section: r.section,
      machine_no: r.machine_no || null,
      card_no_a: r.card_no_a || null,
      card_no_b: r.card_no_b || null,
      sub_label: r.sub_label || null,
      display_order: i,
    }));
    createM.mutate({
      allocation_date: allocationDate,
      shift,
      allocation_type: allocationType,
      total_persons: totalPersons,
      notes: notes || null,
      mill_id: millId ?? null,
      entries,
    });
  };

  const handlePrint = () => window.print();

  const rowsBySection = (sectionKey: string) => rows.filter((r) => r.section === sectionKey);

  return (
    <>
      {/* Print-only styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #learner-print-area, #learner-print-area * { visibility: visible; }
          #learner-print-area {
            position: absolute; top: 0; left: 0; width: 100%;
            font-size: 9pt;
          }
          #learner-print-area table { font-size: 8pt; }
          #learner-print-area th, #learner-print-area td { padding: 1px 3px !important; }
          #learner-print-area h3 { font-size: 7.5pt !important; }
          .print\\:hidden { display: none !important; }
          @page { size: A4 portrait; margin: 8mm 8mm 8mm 8mm; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50/50">
        {/* Toolbar — hidden on print */}
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = "/production/learner-allocations"}
              className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
            <h1 className="text-base font-bold text-gray-900">Manpower Allocation Sheet</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="size-3.5 mr-1.5" /> Print
            </Button>
            <Button size="sm" onClick={handleSave} disabled={createM.isPending}>
              {createM.isPending
                ? <><Loader2 className="size-3.5 animate-spin mr-1.5" /> Saving…</>
                : <><Save className="size-3.5 mr-1.5" /> Save</>}
            </Button>
          </div>
        </div>

        {/* Form body */}
        <div id="learner-print-area" ref={printRef}
             className="max-w-4xl mx-auto px-4 py-6 bg-white print:px-0 print:py-0 print:max-w-none">

          {/* Header — company name + form title */}
          <div className="text-center mb-4 border-b-2 border-gray-800 pb-3">
            <div className="flex items-center justify-between">
              <div className="text-left text-xs text-gray-500 print:text-black">
                <p className="font-bold text-sm text-gray-800 print:text-black">AA</p>
                <p>AA Coarse Spun Limited</p>
                <p>Nagar Howta, Sreepur, Gazipur</p>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-gray-900 print:text-black">Learner Allocation</h2>
              </div>
              <div className="text-right text-xs space-y-1">
                <div className="flex items-center gap-1 justify-end print:hidden">
                  <span className="text-gray-500">Date:</span>
                  <input
                    type="date"
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs"
                    value={allocationDate}
                    onChange={(e) => setAllocationDate(e.target.value)}
                  />
                </div>
                <p className="hidden print:block font-semibold">Date: {allocationDate}</p>
                <div className="flex items-center gap-1 justify-end print:hidden">
                  <span className="text-gray-500">Shift:</span>
                  <select
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
                    value={shift}
                    onChange={(e) => setShift(e.target.value)}
                  >
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                    <option value="night">Night</option>
                  </select>
                </div>
                <p className="hidden print:block capitalize font-semibold">Shift: {shift}</p>
                <div className="flex items-center gap-1 justify-end print:hidden">
                  <span className="text-gray-500">Type:</span>
                  <select
                    className="border border-gray-300 rounded px-2 py-0.5 text-xs bg-white"
                    value={allocationType}
                    onChange={(e) => setAllocationType(e.target.value)}
                  >
                    <option value="P/c">P/c</option>
                    <option value="R/c">R/c</option>
                    <option value="P/c - R/c">P/c - R/c</option>
                  </select>
                </div>
                <p className="hidden print:block font-semibold">Type: {allocationType}</p>
              </div>
            </div>
          </div>

          {/* Two-column layout matching paper: left col + right col */}
          <div className="grid grid-cols-2 gap-4 print:gap-2">
            {/* LEFT COLUMN */}
            <div>
              {SECTIONS.filter(s => ["carding","drawing","simplex"].includes(s.key)).map((sec) => (
                <SectionTable
                  key={sec.key}
                  section={sec}
                  rows={rowsBySection(sec.key)}
                  onUpdate={updateRow}
                  onAdd={addRow}
                  onDelete={deleteRow}
                />
              ))}
              {/* MC section */}
              <SectionTable
                key="mc"
                section={SECTIONS.find(s => s.key === "mc")!}
                rows={rowsBySection("mc")}
                onUpdate={updateRow}
                onAdd={addRow}
                onDelete={deleteRow}
              />
              {/* Floor Cleaner */}
              <SectionTable
                key="floor_cleaner"
                section={SECTIONS.find(s => s.key === "floor_cleaner")!}
                rows={rowsBySection("floor_cleaner")}
                onUpdate={updateRow}
                onAdd={addRow}
                onDelete={deleteRow}
              />
            </div>

            {/* RIGHT COLUMN — Ring Unit A */}
            <div>
              <SectionTable
                key="ring"
                section={SECTIONS.find(s => s.key === "ring")!}
                rows={rowsBySection("ring")}
                onUpdate={updateRow}
                onAdd={addRow}
                onDelete={deleteRow}
              />
              {/* Finishing */}
              <SectionTable
                key="finishing"
                section={SECTIONS.find(s => s.key === "finishing")!}
                rows={rowsBySection("finishing")}
                onUpdate={updateRow}
                onAdd={addRow}
                onDelete={deleteRow}
              />
              {/* Extra */}
              <SectionTable
                key="extra"
                section={SECTIONS.find(s => s.key === "extra")!}
                rows={rowsBySection("extra")}
                onUpdate={updateRow}
                onAdd={addRow}
                onDelete={deleteRow}
              />
            </div>
          </div>

          {/* Footer totals + notes */}
          <div className="mt-4 pt-3 border-t-2 border-gray-800 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-800 print:text-black">
                Ring manpower total setup = <span className="underline">{totalPersons}</span> persons
              </p>
              <div className="print:hidden">
                <label className="text-xs text-gray-500 mr-2">Notes:</label>
                <input
                  className="border border-gray-300 rounded px-2 py-0.5 text-xs w-48"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              {notes && <p className="hidden print:block text-xs">{notes}</p>}
            </div>

            {/* Signature row */}
            <div className="grid grid-cols-6 gap-4 mt-6 pt-4">
              {["Prepared by", "APO(T)/DPO(T)", "DM(P)", "M(P)", "Sr.M(P)", "AGM"].map((sig) => (
                <div key={sig} className="text-center">
                  <div className="border-b border-gray-400 h-8 mb-1" />
                  <p className="text-[9px] text-gray-500 print:text-black">{sig}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

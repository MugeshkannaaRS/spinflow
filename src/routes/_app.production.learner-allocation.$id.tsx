import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { productionApi } from "@/lib/api-service";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_app/production/learner-allocation/$id")({
  head: () => ({ meta: [{ title: "View Learner Allocation — SpinFlow ERP" }] }),
  component: ViewLearnerAllocation,
});

const SECTION_LABELS: Record<string, string> = {
  carding: "Carding",
  drawing: "Drawing",
  simplex: "Simplex",
  ring: "Ring Unit-A",
  mc: "M.C.",
  floor_cleaner: "Floor Cleaner",
  finishing: "Finishing",
  extra: "Extra",
};

const SECTION_ORDER = ["carding", "drawing", "simplex", "ring", "mc", "floor_cleaner", "finishing", "extra"];

function ViewLearnerAllocation() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const q = useQuery({
    queryKey: ["learner-allocation", id],
    queryFn: () => productionApi.getLearnerAllocation(id),
    staleTime: 60_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!q.data) {
    return <div className="p-6 text-red-500">Allocation not found.</div>;
  }

  const alloc = q.data;
  const entries: any[] = alloc.entries ?? [];

  const bySection: Record<string, any[]> = {};
  for (const e of entries) {
    if (!bySection[e.section]) bySection[e.section] = [];
    bySection[e.section].push(e);
  }

  const totalPersons = entries.filter((e) => e.card_no_a || e.card_no_b).length;

  const leftSections = ["carding", "drawing", "simplex", "mc", "floor_cleaner"];
  const rightSections = ["ring", "finishing", "extra"];

  function SectionBlock({ sectionKey }: { sectionKey: string }) {
    const rows = bySection[sectionKey] ?? [];
    if (rows.length === 0) return null;
    const hasB = sectionKey === "ring";
    const isMc = sectionKey === "mc";
    const filledCount = rows.filter((r) => r.card_no_a || r.card_no_b).length;

    return (
      <div className="mb-4 break-inside-avoid">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide border-b border-gray-400 pb-0.5 mb-1 print:text-black">
          {SECTION_LABELS[sectionKey] ?? sectionKey}
          <span className="ml-2 font-normal text-gray-400 print:hidden">({filledCount})</span>
        </h3>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 print:bg-transparent">
              <th className="text-left px-1 py-0.5 border border-gray-200 w-20 font-semibold">M/C No.</th>
              {isMc && <th className="text-left px-1 py-0.5 border border-gray-200 w-24 font-semibold">Type</th>}
              <th className="text-center px-1 py-0.5 border border-gray-200 font-semibold">
                {hasB ? "R/A Card No." : "Card No."}
              </th>
              {hasB && <th className="text-center px-1 py-0.5 border border-gray-200 font-semibold">R/B Card No.</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border border-gray-100 px-1 py-0.5 text-gray-700">{row.machine_no ?? "—"}</td>
                {isMc && <td className="border border-gray-100 px-1 py-0.5 text-gray-500">{row.sub_label ?? ""}</td>}
                <td className="border border-gray-100 px-1 py-0.5 text-center font-mono">{row.card_no_a ?? ""}</td>
                {hasB && <td className="border border-gray-100 px-1 py-0.5 text-center font-mono">{row.card_no_b ?? ""}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={hasB ? 3 : isMc ? 3 : 2}
                  className="px-1 py-0.5 text-right text-[10px] font-semibold text-gray-500 border-t border-gray-200">
                Total: {filledCount}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #learner-view-area, #learner-view-area * { visibility: visible; }
          #learner-view-area { position: fixed; top: 0; left: 0; width: 100%; }
          .print\\:hidden { display: none !important; }
          @page { size: A4; margin: 10mm; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50/50">
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.href = "/production/learner-allocations"}
              className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
            <h1 className="text-base font-bold text-gray-900">
              Learner Allocation — {alloc.allocation_date}
              <span className="ml-2 capitalize text-gray-500 font-normal text-sm">({alloc.shift})</span>
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5 mr-1.5" /> Print
          </Button>
        </div>

        <div id="learner-view-area" className="max-w-4xl mx-auto px-4 py-6 bg-white print:px-0 print:py-0 print:max-w-none">
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
                <p className="font-semibold">Date: {alloc.allocation_date}</p>
                <p className="capitalize font-semibold">Shift: {alloc.shift}</p>
                {alloc.allocation_type && <p className="font-semibold">Type: {alloc.allocation_type}</p>}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 print:gap-2">
            <div>{leftSections.map(s => <SectionBlock key={s} sectionKey={s} />)}</div>
            <div>{rightSections.map(s => <SectionBlock key={s} sectionKey={s} />)}</div>
          </div>

          <div className="mt-4 pt-3 border-t-2 border-gray-800 space-y-2">
            <p className="text-sm font-bold text-gray-800 print:text-black">
              Ring manpower total setup = <span className="underline">{alloc.total_persons ?? totalPersons}</span> persons
            </p>
            {alloc.notes && <p className="text-xs text-gray-600">{alloc.notes}</p>}
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

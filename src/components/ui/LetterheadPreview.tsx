/**
 * LetterheadPreview — system-wide print-with-letterhead preview modal.
 *
 * Renders a clean A4 HTML view of a single record.
 * Clicking "Print" calls window.print(); the @media print CSS
 * (injected by this component via a <style> tag) hides everything
 * except the preview content — sidebar, topbar, buttons all vanish.
 *
 * Usage:
 *   const [previewRow, setPreviewRow] = useState<any>(null);
 *   // In table row:
 *   <button onClick={() => setPreviewRow(row)}><Eye /></button>
 *   // Outside table:
 *   <LetterheadPreview
 *     open={!!previewRow}
 *     onClose={() => setPreviewRow(null)}
 *     row={previewRow}
 *     columns={columns}          // ExportColumn[] — same as ExportMenu
 *     title="RF Snap Study"
 *     millName={millName}
 *     subtitle="26/06/2026"
 *     customBody={optionalRenderer} // same signature as drawCustomBody in export-utils
 *   />
 */

import { useEffect, useRef } from "react";
import { X, Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportToLetterheadPdf } from "@/lib/export-utils";
import type { ExportColumn } from "@/lib/export-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LetterheadPreviewProps {
  open: boolean;
  onClose: () => void;
  row: any | null;
  columns: ExportColumn[];
  title: string;
  millName?: string;
  subtitle?: string;
  /** Optional custom HTML body renderer — receives the row, returns a JSX element */
  customBody?: (row: any) => React.ReactNode;
  /** Optional custom jsPDF renderer (for Download PDF) — same as drawCustomBody in LetterheadOptions */
  customPdfBody?: (
    doc: any,
    row: any,
    yStart: number,
    ctx: { pageW: number; margin: number; pageH: number },
  ) => number;
}

// ─── Helper: format a cell value for display ──────────────────────────────────

function fmtVal(col: ExportColumn, row: any): string {
  const v = row?.[col.key];
  if (col.format) return col.format(v, row);
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

// ─── SKIP keys that are internal / not useful on a printed form ───────────────

const SKIP_KEYS = new Set([
  "id", "mill_id", "company_id", "created_at", "updated_at",
]);

// ─── Default generic body — two-column label:value pairs ─────────────────────

function DefaultBody({ row, columns }: { row: any; columns: ExportColumn[] }) {
  const visible = columns.filter((c) => !SKIP_KEYS.has(c.key));
  const pairs: [ExportColumn, ExportColumn | null][] = [];
  for (let i = 0; i < visible.length; i += 2) {
    pairs.push([visible[i], visible[i + 1] ?? null]);
  }

  return (
    <div className="divide-y divide-gray-100">
      {pairs.map(([lc, rc], pi) => (
        <div
          key={pi}
          className="grid grid-cols-2 gap-0"
          style={{ background: pi % 2 === 0 ? "#fafbff" : "#f2f5fc" }}
        >
          {/* Left cell */}
          <div className="px-4 py-2 flex gap-2">
            <span className="text-[11px] font-semibold text-slate-500 w-36 shrink-0">
              {lc.label}
            </span>
            <span className="text-[12px] text-slate-800 font-mono break-all">
              {fmtVal(lc, row)}
            </span>
          </div>
          {/* Right cell */}
          {rc ? (
            <div className="px-4 py-2 flex gap-2 border-l border-gray-100">
              <span className="text-[11px] font-semibold text-slate-500 w-36 shrink-0">
                {rc.label}
              </span>
              <span className="text-[12px] text-slate-800 font-mono break-all">
                {fmtVal(rc, row)}
              </span>
            </div>
          ) : (
            <div className="px-4 py-2 border-l border-gray-100" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LetterheadPreview({
  open,
  onClose,
  row,
  columns,
  title,
  millName = "SpinFlow ERP",
  subtitle,
  customBody,
  customPdfBody,
}: LetterheadPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  // Inject print CSS once — hides everything except #sf-print-root
  useEffect(() => {
    const styleId = "sf-letterhead-print-css";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
@media print {
  /* Hide the entire app shell */
  body > *:not(#sf-print-root) { display: none !important; }
  [data-print-hide] { display: none !important; }

  /* Reset page */
  @page { size: A4 portrait; margin: 12mm 14mm; }
  body { background: white !important; }

  /* Show only the print target */
  #sf-print-root {
    display: block !important;
    position: fixed !important;
    inset: 0 !important;
    z-index: 99999 !important;
    background: white !important;
    overflow: visible !important;
  }

  /* Hide modal chrome — only the inner content prints */
  #sf-print-root .sf-no-print { display: none !important; }
  #sf-print-root .sf-print-body {
    box-shadow: none !important;
    border-radius: 0 !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* Force page breaks between multi-record sets if needed */
  .sf-page-break { page-break-after: always; }
}
    `;
    document.head.appendChild(style);
  }, []);

  if (!open || !row) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = async () => {
    await exportToLetterheadPdf({
      filename: title.replace(/[^a-z0-9]/gi, "_").toLowerCase(),
      title,
      millName,
      subtitle,
      columns,
      rows: [row],
      drawCustomBody: customPdfBody,
    });
  };

  const statusVal = row.status ?? row.ok_input ?? row.result ?? null;
  const statusStr = statusVal != null ? String(statusVal).toUpperCase() : null;
  const isOk =
    statusStr != null &&
    ["OK", "PASS", "APPROVED", "TRUE", "1", "APPROVE", "ACTIVE"].includes(statusStr);

  const today = new Date().toLocaleString("en-IN");

  return (
    // Full-screen backdrop
    <div
      className="sf-no-print fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* The printable root — this div stays visible during print */}
      <div id="sf-print-root" className="w-full max-w-3xl">
        {/* Toolbar — hidden during print */}
        <div className="sf-no-print flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePrint} className="gap-1.5 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white">
              <Printer className="size-3.5" />
              Print with Letterhead
            </Button>
            <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 h-8 text-xs">
              <Download className="size-3.5" />
              Download PDF
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
            <X className="size-4" />
          </Button>
        </div>

        {/* ── A4 paper ─────────────────────────────────────────────────── */}
        <div
          className="sf-print-body bg-white shadow-2xl rounded-lg overflow-hidden"
          style={{ fontFamily: "helvetica, Arial, sans-serif" }}
        >
          {/* Header banner */}
          <div style={{ background: "#1e3a8a", padding: "16px 20px 14px" }}>
            <div className="flex justify-between items-start">
              <div>
                <div style={{ color: "white", fontSize: 18, fontWeight: 700, letterSpacing: 0.3 }}>
                  {millName}
                </div>
                <div style={{ color: "#b4c8ff", fontSize: 11, marginTop: 3 }}>{title}</div>
                {subtitle && (
                  <div style={{ color: "#93b4ff", fontSize: 10, marginTop: 1 }}>{subtitle}</div>
                )}
              </div>
              <div style={{ color: "#c8d8ff", fontSize: 10, textAlign: "right" }}>
                <div>{today}</div>
                {row.date && <div style={{ marginTop: 2, fontWeight: 600, color: "white" }}>{row.date}</div>}
              </div>
            </div>
            {/* Thin accent line */}
            <div style={{ height: 1, background: "#6394ff", marginTop: 12 }} />
          </div>

          {/* Body — custom or default */}
          <div className="bg-white">
            {customBody ? (
              customBody(row)
            ) : (
              <DefaultBody row={row} columns={columns} />
            )}
          </div>

          {/* Status + % summary box */}
          {(() => {
            const pctCols = columns.filter(
              (c) =>
                !SKIP_KEYS.has(c.key) &&
                (c.key.includes("pct") ||
                  c.key.includes("waste") ||
                  c.key.includes("percent") ||
                  c.key.includes("a_pct") ||
                  c.key.includes("cv_")),
            );
            if (pctCols.length === 0) return null;
            return (
              <div style={{ margin: "0 20px 16px", padding: "10px 14px", background: "#f0f4ff", borderRadius: 6, border: "1px solid #c8d4f0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#1e3a8a", marginBottom: 6 }}>
                  Key Metrics
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px" }}>
                  {pctCols.map((c) => (
                    <div key={c.key}>
                      <span style={{ fontSize: 10, color: "#64748b" }}>{c.label}: </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#1e293b", fontFamily: "monospace" }}>
                        {fmtVal(c, row)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Footer — status badge + signatures */}
          <div style={{ borderTop: "1px solid #e2e8f0", margin: "0 20px", paddingTop: 12, paddingBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              {/* Status badge */}
              {statusStr && (
                <div
                  style={{
                    padding: "4px 14px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    background: isOk ? "#dcfce7" : statusStr === "DRAFT" ? "#fef9c3" : "#fee2e2",
                    color: isOk ? "#166534" : statusStr === "DRAFT" ? "#854d0e" : "#991b1b",
                    border: `1px solid ${isOk ? "#86efac" : statusStr === "DRAFT" ? "#fde047" : "#fca5a5"}`,
                    letterSpacing: 0.5,
                  }}
                >
                  {statusStr}
                </div>
              )}
              <div style={{ flex: 1 }} />
            </div>

            {/* Signature lines */}
            <div style={{ display: "flex", justifyContent: "space-around", marginTop: 28, marginBottom: 8 }}>
              {["Operator", "Supervisor", "QA Manager"].map((label) => (
                <div key={label} style={{ textAlign: "center", width: 100 }}>
                  <div style={{ borderTop: "1px solid #94a3b8", marginBottom: 4 }} />
                  <div style={{ fontSize: 9, color: "#94a3b8" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer bar */}
          <div style={{ background: "#f8fafc", padding: "6px 20px", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: "#94a3b8" }}>SpinFlow ERP</span>
            <span style={{ fontSize: 9, color: "#94a3b8" }}>{today}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Universal export utilities for SpinFlow tables.
 * Supports Excel (.xlsx) and PDF output with a consistent look.
 *
 * Usage:
 *   exportToExcel({ filename: "entries-2024-01-15", columns, rows })
 *   exportToPdf({ filename: "entries-2024-01-15", title, columns, rows })
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ExportColumn {
  /** Key in the row object */
  key: string;
  /** Human-readable header */
  label: string;
  /** Optional formatter — receives raw value, returns display string */
  format?: (value: any, row: any) => string;
  /** Optional width in chars (Excel) or mm (PDF) */
  width?: number;
}

export interface ExportOptions {
  filename: string;
  /** Visible title printed at the top of the PDF. Not used for Excel. */
  title?: string;
  /** Subtitle / date-range line */
  subtitle?: string;
  columns: ExportColumn[];
  rows: any[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCell(col: ExportColumn, row: any): string {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return String(raw);
}

function todayStr() {
  return new Date().toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

// ── Excel export (using SheetJS CDN) ─────────────────────────────────────────

async function loadXLSX(): Promise<any> {
  // Prefer already-loaded XLSX (e.g. from SheetJS CDN in pptx skill bundles)
  if ((window as any).XLSX) return (window as any).XLSX;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve((window as any).XLSX);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function exportToExcel(opts: ExportOptions): Promise<void> {
  const XLSX = await loadXLSX();

  // Header row
  const header = opts.columns.map((c) => c.label);
  // Data rows
  const data = opts.rows.map((row) => opts.columns.map((col) => formatCell(col, row)));

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  // Column widths
  ws["!cols"] = opts.columns.map((col) => ({
    wch: col.width ?? Math.max(col.label.length + 2, 12),
  }));

  // Bold header row
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) {
      ws[addr].s = { font: { bold: true }, fill: { fgColor: { rgb: "E8F0FE" } } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  XLSX.writeFile(wb, `${opts.filename}.xlsx`);
}

// ── PDF export (using jsPDF + autoTable) ─────────────────────────────────────

async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf) return (window as any).jspdf;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve((window as any).jspdf);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function loadAutoTable(): Promise<void> {
  if ((window as any).jspdf?.jsPDF?.API?.autoTable) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function exportToPdf(opts: ExportOptions): Promise<void> {
  const jspdf = await loadJsPDF();
  await loadAutoTable();

  const { jsPDF } = jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // Title block
  const title = opts.title ?? opts.filename;
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, 14, 18);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const subLine = `${opts.subtitle ? opts.subtitle + "   " : ""}Generated: ${todayStr()}   Total rows: ${opts.rows.length}`;
  doc.text(subLine, 14, 25);

  // Table
  const head = [opts.columns.map((c) => c.label)];
  const body = opts.rows.map((row) => opts.columns.map((col) => formatCell(col, row)));

  (doc as any).autoTable({
    head,
    body,
    startY: 30,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [52, 100, 230], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    columnStyles: opts.columns.reduce((acc: any, col, i) => {
      if (col.width) acc[i] = { cellWidth: col.width };
      return acc;
    }, {}),
    margin: { left: 14, right: 14 },
    didDrawPage: (data: any) => {
      // Footer
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `SpinFlow ERP — Page ${data.pageNumber}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 8,
        { align: "center" },
      );
    },
  });

  doc.save(`${opts.filename}.pdf`);
}

// ── Convenience: export menu component props ─────────────────────────────────

export type ExportFormat = "excel" | "pdf";

export async function exportData(
  format: ExportFormat,
  opts: ExportOptions,
): Promise<void> {
  if (format === "excel") return exportToExcel(opts);
  if (format === "pdf") return exportToPdf(opts);
}

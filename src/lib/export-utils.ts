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
    day: "2-digit",
    month: "short",
    year: "numeric",
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
    s.src =
      "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function exportToPdf(opts: ExportOptions): Promise<void> {
  const jspdf = await loadJsPDF();
  await loadAutoTable();

  const { jsPDF } = jspdf;

  // Auto-select page size based on column count
  const colCount = opts.columns.length;
  const format = colCount > 16 ? "a3" : colCount > 10 ? "a3" : "a4";
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const usableW = pageW - margin * 2;

  // Title block
  const title = opts.title ?? opts.filename;
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 20, 20);
  doc.text(title, margin, 16);

  // Thin accent line under title
  doc.setDrawColor(52, 100, 230);
  doc.setLineWidth(0.5);
  doc.line(margin, 19, margin + 60, 19);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  const subLine = [
    opts.subtitle,
    `Generated: ${todayStr()}`,
    `Total rows: ${opts.rows.length}`,
  ].filter(Boolean).join("   ·   ");
  doc.text(subLine, margin, 25);

  // ── Column width distribution ──────────────────────────────────────────────
  // Give each column an equal slice; honour explicit col.width overrides.
  const equalW = Math.floor(usableW / colCount);
  const colStyles: Record<number, any> = {};
  opts.columns.forEach((col, i) => {
    colStyles[i] = { cellWidth: col.width ?? equalW };
  });

  // Font size: shrink for wide tables so content fits
  const tableFontSize = colCount > 18 ? 6 : colCount > 12 ? 7 : 8;

  // Table
  const head = [opts.columns.map((c) => c.label)];
  const body = opts.rows.map((row) => opts.columns.map((col) => formatCell(col, row)));

  (doc as any).autoTable({
    head,
    body,
    startY: 30,
    tableWidth: usableW,
    styles: {
      fontSize: tableFontSize,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: [30, 58, 138],   // deep navy
      textColor: 255,
      fontStyle: "bold",
      fontSize: tableFontSize,
      halign: "center",
    },
    alternateRowStyles: { fillColor: [245, 247, 252] },
    bodyStyles: { textColor: [30, 30, 30] },
    columnStyles: colStyles,
    margin: { left: margin, right: margin },
    didDrawPage: (data: any) => {
      const pageH = doc.internal.pageSize.getHeight();
      // Footer bar
      doc.setFillColor(248, 249, 252);
      doc.rect(0, pageH - 10, pageW, 10, "F");
      doc.setFontSize(7);
      doc.setTextColor(140);
      doc.text("SpinFlow ERP", margin, pageH - 3.5);
      doc.text(
        `Page ${data.pageNumber}`,
        pageW / 2, pageH - 3.5,
        { align: "center" },
      );
      doc.text(
        new Date().toLocaleString("en-IN"),
        pageW - margin, pageH - 3.5,
        { align: "right" },
      );
    },
  });

  doc.save(`${opts.filename}.pdf`);
}

// ── CSV export ───────────────────────────────────────────────────────────────

export async function exportToCsv(opts: ExportOptions): Promise<void> {
  const header = opts.columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const dataRows = opts.rows.map((row) =>
    opts.columns
      .map((col) => {
        const v = formatCell(col, row);
        return `"${v.replace(/"/g, '""')}"`;
      })
      .join(","),
  );
  const csv = [header, ...dataRows].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }); // BOM for Excel compatibility
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${opts.filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Convenience dispatcher ────────────────────────────────────────────────────

export type ExportFormat = "csv" | "excel" | "pdf";

export async function exportData(format: ExportFormat, opts: ExportOptions): Promise<void> {
  if (format === "csv") return exportToCsv(opts);
  if (format === "excel") return exportToExcel(opts);
  if (format === "pdf") return exportToPdf(opts);
}

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

export async function loadJsPDF(): Promise<any> {
  if ((window as any).jspdf) return (window as any).jspdf;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve((window as any).jspdf);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

export async function loadAutoTable(): Promise<void> {
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

// ── Letterhead PDF: one record per A4 page ───────────────────────────────────
// Used for quality department forms.
// Each row from `opts.rows` gets its own page.
// Layout: mill name at top, two-column label:value pairs in the middle,
// waste % summary box (if present), status + signature line at bottom.

export interface LetterheadOptions extends ExportOptions {
  /** Mill / company name to show in the letterhead header */
  millName?: string;
  /**
   * Optional custom body renderer for specialised forms (A% Check, CSP, etc).
   * When provided it completely replaces the generic field-pairs section.
   * Receives the jsPDF doc, the data row, the y-start position, and page dims.
   * Must return the y position after its last drawn element.
   */
  drawCustomBody?: (
    doc: any,
    row: any,
    yStart: number,
    ctx: { pageW: number; margin: number; pageH: number },
  ) => number;
}


// Actual implementation using a single jsPDF doc with addPage() between records
async function _buildLetterheadPdf(opts: LetterheadOptions): Promise<any> {
  const jspdf = await loadJsPDF();
  await loadAutoTable();
  const { jsPDF } = jspdf;

  const SKIP_KEYS = new Set(["id", "mill_id", "company_id", "created_at", "updated_at"]);
  const visibleCols = opts.columns.filter((c) => !SKIP_KEYS.has(c.key));
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const mill = opts.millName ?? "SpinFlow ERP";

  function drawPage(doc: any, row: any, rowIdx: number, total: number) {
    const colMid = pageW / 2;
    const rowH = 7.5;

    // ── Letterhead header ──────────────────────────────────────────────────
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageW, 22, "F");
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(mill, margin, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 200, 255);
    doc.text(opts.title ?? opts.filename, margin, 18);
    doc.setFontSize(8);
    doc.setTextColor(200, 220, 255);
    doc.text(`Record ${rowIdx + 1} of ${total}`, pageW - margin, 14, { align: "right" });
    doc.setDrawColor(99, 148, 255);
    doc.setLineWidth(0.4);
    doc.line(margin, 24, pageW - margin, 24);

    // ── Body: custom renderer OR generic field pairs ───────────────────────
    let y = 31;

    if (opts.drawCustomBody) {
      // Specialised forms (A% Check, CSP, etc.) draw their own table
      y = opts.drawCustomBody(doc, row, y, { pageW, margin, pageH });
    } else {
      const leftCols = visibleCols.filter((_, i) => i % 2 === 0);
      const rightCols = visibleCols.filter((_, i) => i % 2 === 1);
      const maxPairs = Math.max(leftCols.length, rightCols.length);
      const labelW = 46;

      for (let i = 0; i < maxPairs; i++) {
        const lc = leftCols[i];
        const rc = rightCols[i];
        const bg = i % 2 === 0 ? [252, 253, 255] : [246, 248, 252];
        doc.setFillColor(...bg as [number, number, number]);
        doc.rect(margin - 1, y - 5, pageW - margin * 2 + 2, rowH, "F");

        if (lc) {
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(70, 80, 100);
          doc.text(lc.label + ":", margin + 1, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(20, 20, 20);
          const val = String(formatCell(lc, row) || "—");
          doc.text(doc.splitTextToSize(val, colMid - margin - labelW - 4)[0], margin + labelW, y);
        }
        if (rc) {
          const rx = colMid + 4;
          doc.setFontSize(7.5);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(70, 80, 100);
          doc.text(rc.label + ":", rx, y);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(20, 20, 20);
          const val = String(formatCell(rc, row) || "—");
          doc.text(doc.splitTextToSize(val, pageW - margin - rx - labelW)[0], rx + labelW, y);
        }
        y += rowH;

        if (y > pageH - 50) break;
      }

      // ── Waste summary box ─────────────────────────────────────────────────
      const wasteKeys = visibleCols.filter(
        (c) => (c.key.includes("waste") || c.key.includes("pct") || c.key.includes("percent")),
      );
      if (wasteKeys.length > 0 && y < pageH - 55) {
        y += 4;
        const boxRows = Math.ceil(wasteKeys.length / 3);
        const boxH = 8 + boxRows * 7;
        doc.setFillColor(240, 244, 255);
        doc.setDrawColor(150, 170, 230);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, y, pageW - margin * 2, boxH, 2, 2, "FD");
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 58, 138);
        doc.text("Waste / % Breakdown", margin + 3, y + 6);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 60);
        let wy2 = y + 13;
        wasteKeys.forEach((c, ki) => {
          const val = formatCell(c, row);
          const col3 = ki % 3;
          doc.text(`${c.label}: ${val || "—"}`, margin + 4 + col3 * 60, wy2);
          if (col3 === 2) wy2 += 7;
        });
        y += boxH + 5;
      }
    }

    // ── Status + signatures ────────────────────────────────────────────────
    const statusVal = row.status ?? row.ok_input ?? row.result ?? null;
    const sigY = pageH - 26;
    doc.setDrawColor(200, 200, 215);
    doc.setLineWidth(0.3);
    doc.line(margin, sigY - 5, pageW - margin, sigY - 5);

    if (statusVal !== null) {
      const statusStr = String(statusVal).toUpperCase();
      const isOk = ["OK", "PASS", "APPROVED", "TRUE", "1"].includes(statusStr);
      doc.setFillColor(...(isOk ? [220, 252, 231] : [254, 226, 226]) as [number, number, number]);
      doc.setDrawColor(...(isOk ? [134, 239, 172] : [252, 165, 165]) as [number, number, number]);
      doc.roundedRect(margin, sigY - 2, 34, 8, 1.5, 1.5, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...(isOk ? [22, 101, 52] : [153, 27, 27]) as [number, number, number]);
      doc.text(statusStr, margin + 17, sigY + 3.5, { align: "center" });
    }

    const sigLabels = ["Operator", "Supervisor", "QA Manager"];
    const sigSpacing = (pageW - margin * 2) / sigLabels.length;
    sigLabels.forEach((label, i) => {
      const sx = margin + i * sigSpacing + sigSpacing / 2;
      doc.setDrawColor(140, 140, 155);
      doc.setLineWidth(0.3);
      doc.line(sx - 22, sigY + 9, sx + 22, sigY + 9);
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130);
      doc.text(label, sx, sigY + 13, { align: "center" });
    });

    // Footer bar
    doc.setFillColor(245, 247, 252);
    doc.rect(0, pageH - 9, pageW, 9, "F");
    doc.setFontSize(6.5);
    doc.setTextColor(150);
    doc.text("SpinFlow ERP", margin, pageH - 3.5);
    doc.text(new Date().toLocaleString("en-IN"), pageW - margin, pageH - 3.5, { align: "right" });
  }

  opts.rows.forEach((row, i) => {
    if (i > 0) doc.addPage();
    drawPage(doc, row, i, opts.rows.length);
  });

  return doc;
}

// Public function — builds and saves the letterhead PDF
export async function exportToLetterheadPdf(opts: LetterheadOptions): Promise<void> {
  const doc = await _buildLetterheadPdf(opts);
  doc.save(`${opts.filename}_letterhead.pdf`);
}

// ── Convenience dispatcher ────────────────────────────────────────────────────

export type ExportFormat = "csv" | "excel" | "pdf";

export async function exportData(format: ExportFormat, opts: ExportOptions): Promise<void> {
  if (format === "csv") return exportToCsv(opts);
  if (format === "excel") return exportToExcel(opts);
  if (format === "pdf") return exportToPdf(opts);
}

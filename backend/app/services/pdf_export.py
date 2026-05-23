from io import BytesIO
from typing import Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


def _build_doc(title_text: str, author: str = "SpinFlow ERP") -> tuple[BytesIO, SimpleDocTemplate]:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
    )
    return buf, doc


def _header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7)
    canvas.drawCentredString(doc.width / 2 + doc.leftMargin, 10 * mm, "SpinFlow ERP — Confidential")
    canvas.restoreState()


def production_report(data: list[dict], title: str = "Production Report") -> bytes:
    buf, doc = _build_doc(title)
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(title, styles["Title"]))
    elements.append(Spacer(1, 4 * mm))
    elements.append(HRFlowable(width="100%", color=colors.grey, thickness=0.5))
    elements.append(Spacer(1, 4 * mm))

    if not data:
        elements.append(Paragraph("No data available.", styles["Normal"]))
    else:
        headers = list(data[0].keys())
        table_data = [[h.replace("_", " ").title() for h in headers]]
        for row in data:
            table_data.append([str(row.get(h, "")) for h in headers])

        col_widths = [max(doc.width / len(headers), 50 * mm)] * len(headers)
        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563EB")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 8),
            ("FONTSIZE", (0, 1), (-1, -1), 7),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
        ]))
        elements.append(t)

    doc.build(elements, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buf.getvalue()


def payslip(
    employee_name: str,
    employee_code: str,
    department: str,
    month: int,
    year: int,
    data: dict,
) -> bytes:
    buf, doc = _build_doc(f"Payslip — {employee_name}")
    styles = getSampleStyleSheet()

    month_names = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ]

    elements = []
    elements.append(Paragraph(f"Payslip — {month_names[month - 1]} {year}", styles["Title"]))
    elements.append(Spacer(1, 3 * mm))
    elements.append(HRFlowable(width="100%", color=colors.grey, thickness=0.5))
    elements.append(Spacer(1, 3 * mm))

    info_style = ParagraphStyle("Info", parent=styles["Normal"], fontSize=9, leading=13)
    elements.append(Paragraph(f"Employee: <b>{employee_name}</b>  |  Code: <b>{employee_code}</b>", info_style))
    elements.append(Paragraph(f"Department: <b>{department}</b>", info_style))
    elements.append(Spacer(1, 4 * mm))

    earnings_data = [
        ["Description", "Amount (₹)"],
        ["Basic Wage", f"{data.get('basic_wage', 0):.2f}"],
        ["Overtime Amount", f"{data.get('overtime_amount', 0):.2f}"],
        ["Gross Wage", f"{data.get('gross_wage', 0):.2f}"],
    ]
    deductions_data = [
        ["Description", "Amount (₹)"],
        ["PF (Employee)", f"{data.get('pf_employee', 0):.2f}"],
        ["ESIC (Employee)", f"{data.get('esic_employee', 0):.2f}"],
        ["Other Deductions", f"{data.get('other_deductions', 0):.2f}"],
        ["Net Wage", f"{data.get('net_wage', 0):.2f}"],
    ]

    col_w = doc.width * 0.45
    earnings_table = Table(earnings_data, colWidths=[col_w, col_w])
    earnings_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#059669")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
    ]))

    deductions_table = Table(deductions_data, colWidths=[col_w, col_w])
    deductions_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#DC2626")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
    ]))

    inner = Table([[earnings_table, deductions_table]], colWidths=[col_w + 2 * mm, col_w + 2 * mm])
    inner.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elements.append(inner)
    elements.append(Spacer(1, 3 * mm))

    summary_data = [
        ["Present Days", str(data.get("present_days", 0))],
        ["Absent Days", str(data.get("absent_days", 0))],
        ["Half Days", str(data.get("half_days", 0))],
        ["Overtime Hours", f"{data.get('overtime_hours', 0):.1f}"],
    ]
    summary_table = Table(summary_data, colWidths=[col_w, col_w])
    summary_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
    ]))
    elements.append(summary_table)

    doc.build(elements, onFirstPage=_header_footer, onLaterPages=_header_footer)
    return buf.getvalue()


def dispatch_summary(data: list[dict], title: str = "Dispatch Summary") -> bytes:
    return production_report(data, title)

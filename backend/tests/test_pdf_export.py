from app.services.pdf_export import production_report, payslip, dispatch_summary


def test_production_report_returns_pdf_bytes():
    data = [
        {"date": "2026-05-01", "shift": "A", "machine": "MCH-001", "produced_kg": "1000", "status": "approved"},
        {"date": "2026-05-02", "shift": "B", "machine": "MCH-002", "produced_kg": "1200", "status": "pending"},
    ]
    result = production_report(data)
    assert isinstance(result, bytes)
    assert len(result) > 100
    assert result.startswith(b"%PDF")


def test_production_report_empty_data():
    result = production_report([])
    assert isinstance(result, bytes)
    assert result.startswith(b"%PDF")


def test_payslip_returns_pdf_bytes():
    data = {
        "basic_wage": 5000.0,
        "overtime_amount": 750.0,
        "gross_wage": 5750.0,
        "pf_employee": 600.0,
        "esic_employee": 43.12,
        "other_deductions": 0.0,
        "net_wage": 5106.88,
        "present_days": 26,
        "absent_days": 0,
        "half_days": 0,
        "overtime_hours": 12.0,
    }
    result = payslip(
        employee_name="Kumar",
        employee_code="EMP-001",
        department="Spinning",
        month=5,
        year=2026,
        data=data,
    )
    assert isinstance(result, bytes)
    assert len(result) > 100
    assert result.startswith(b"%PDF")


def test_dispatch_summary_returns_pdf_bytes():
    data = [
        {"dispatch_no": "DSP-001", "date": "2026-05-01", "customer": "ABC Mills", "quantity_kg": "5000", "status": "dispatched"},
    ]
    result = dispatch_summary(data)
    assert isinstance(result, bytes)
    assert len(result) > 100
    assert result.startswith(b"%PDF")

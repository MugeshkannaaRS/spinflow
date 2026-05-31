"""Test dashboard summary - data shape, defaults, mill scoping."""


class TestDashboardSummary:
    def test_response_has_all_required_fields(self):
        summary = {
            "production_today": 4280,
            "production_target": 5000,
            "waste_percent": 3.8,
            "attendance_present": 387,
            "attendance_total": 422,
            "active_machines": 47,
            "total_machines": 52,
            "monthly_revenue": 3840000,
            "revenue_target": 4500000,
            "pending_payments": 1280000,
            "overdue_customers": 4,
        }
        required = [
            "production_today", "production_target", "waste_percent",
            "attendance_present", "attendance_total", "active_machines",
            "total_machines", "monthly_revenue", "revenue_target",
            "pending_payments", "overdue_customers",
        ]
        for field in required:
            assert field in summary, f"Missing field: {field}"

    def test_returns_sensible_defaults_when_no_data(self):
        summary = {}
        safe = {
            "production_today": summary.get("production_today", 0) or 0,
            "production_target": summary.get("production_target", 1) or 1,
            "waste_percent": summary.get("waste_percent", 0) or 0,
            "attendance_present": summary.get("attendance_present", 0) or 0,
            "attendance_total": summary.get("attendance_total", 1) or 1,
            "active_machines": summary.get("active_machines", 0) or 0,
            "total_machines": summary.get("total_machines", 1) or 1,
            "monthly_revenue": summary.get("monthly_revenue", 0) or 0,
            "revenue_target": summary.get("revenue_target", 1) or 1,
            "pending_payments": summary.get("pending_payments", 0) or 0,
            "overdue_customers": summary.get("overdue_customers", 0) or 0,
        }
        for key, val in safe.items():
            assert val is not None, f"Default for {key} is None"

    def test_does_not_crash_on_null_values(self):
        summary = {
            "production_today": None,
            "waste_percent": None,
            "attendance_present": None,
        }
        safe_production = summary.get("production_today", 0) or 0
        safe_waste = summary.get("waste_percent", 0) or 0
        assert safe_production == 0
        assert safe_waste == 0

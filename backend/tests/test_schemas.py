from datetime import date, datetime
import pytest
from pydantic import ValidationError

from app.schemas.inventory import LotCreate
from app.schemas.purchase import CottonPurchaseCreate
from app.schemas.accounts import InvoiceCreate
from app.schemas.hr import LeaveRequestCreate, AttendanceCreate, EmployeeCreate
from app.schemas.reports import DateRangeQuery
from app.schemas.stores import SpareIssueCreate
from app.schemas.users import UserCreate, UserOut


class TestLotCreate:
    def test_rejects_invalid_count_pattern(self):
        with pytest.raises(ValidationError, match="count must match pattern"):
            LotCreate(count="cotton", total_bags=10)

    def test_accepts_valid_count(self):
        lot = LotCreate(count="40s", total_bags=10)
        assert lot.count == "40s"
        assert lot.bag_weight_kg == 23.0


class TestCottonPurchaseCreate:
    def test_computes_total_value(self):
        cp = CottonPurchaseCreate(
            supplier_id="s1",
            purchase_date=date(2025, 1, 1),
            bale_count=10,
            weight_kg=50.0,
            rate_per_quintal=3000.0,
        )
        expected = 10 * 50.0 * 3000.0 / 100
        assert cp.total_value == expected


class TestInvoiceCreate:
    def test_computes_tax_and_total(self):
        inv = InvoiceCreate(
            party_name="Test",
            invoice_date=date(2025, 1, 1),
            taxable_amount=100000.0,
            igst_rate=0.0,
            cgst_rate=9.0,
            sgst_rate=9.0,
            transport_charges=5000.0,
            other_charges=2000.0,
        )
        expected_tax = 100000.0 * (0.0 + 9.0 + 9.0) / 100
        assert inv.tax_amount == expected_tax
        expected_total = 100000.0 + expected_tax + 5000.0 + 2000.0
        assert inv.total_amount == expected_total


class TestLeaveRequestCreate:
    def test_rejects_to_date_before_from_date(self):
        with pytest.raises(ValidationError, match="to_date must be on or after from_date"):
            LeaveRequestCreate(
                employee_id="e1",
                leave_type="CL",
                from_date=date(2025, 1, 10),
                to_date=date(2025, 1, 5),
                reason="Needs to be at least 5 chars",
            )


class TestDateRangeQuery:
    def test_rejects_range_over_90_days(self):
        with pytest.raises(ValidationError, match="cannot exceed 90"):
            DateRangeQuery(
                date_from=date(2025, 1, 1),
                date_to=date(2025, 4, 5),
            )

    def test_accepts_valid_range(self):
        q = DateRangeQuery(date_from=date(2025, 1, 1), date_to=date(2025, 3, 31))
        assert q.date_from == date(2025, 1, 1)


class TestSpareIssueCreate:
    def test_rejects_when_both_machine_id_and_purpose_none(self):
        with pytest.raises(ValidationError, match="At least one"):
            SpareIssueCreate(item_id="i1", quantity=5.0)

    def test_accepts_when_purpose_provided(self):
        s = SpareIssueCreate(item_id="i1", quantity=5.0, purpose="Replacement")
        assert s.purpose == "Replacement"


class TestUserCreate:
    def test_rejects_password_with_no_uppercase(self):
        with pytest.raises(ValidationError, match="uppercase"):
            UserCreate(
                email="test@test.com",
                full_name="Test User",
                password="lowercase1!",
                role="operator",
            )

    def test_rejects_password_with_no_digit(self):
        with pytest.raises(ValidationError, match="digit"):
            UserCreate(
                email="test@test.com",
                full_name="Test User",
                password="NoDigitHere!",
                role="operator",
            )

    def test_rejects_password_with_no_special_char(self):
        with pytest.raises(ValidationError, match="special character"):
            UserCreate(
                email="test@test.com",
                full_name="Test User",
                password="NoSpecialChar1",
                role="operator",
            )


class TestUserOut:
    def test_never_contains_hashed_password(self):
        assert "hashed_password" not in UserOut.model_fields
        assert "password" not in UserOut.model_fields


class TestAttendanceCreate:
    def test_rejects_invalid_status(self):
        with pytest.raises(ValidationError, match="status must be one of"):
            AttendanceCreate(
                employee_id="e1",
                attendance_date=date(2025, 1, 1),
                status="INVALID",
            )


class TestEmployeeCreate:
    def test_rejects_invalid_shift(self):
        with pytest.raises(ValidationError, match="shift must be one of"):
            EmployeeCreate(
                employee_code="E001",
                full_name="Test",
                department="Spinning",
                designation="Operator",
                shift="D",
            )

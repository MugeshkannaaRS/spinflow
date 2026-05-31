"""Test masters schemas - GSTIN validation and numeric coercion."""

import re
from typing import Optional


def validate_gstin(v):
    if not v or str(v).strip() == "":
        return None
    v = str(v).strip().upper()
    if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
        raise ValueError("Invalid GSTIN format (e.g. 29ABCDE1234F1Z5)")
    return v


def coerce_numeric(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


class TestGstinValidation:
    def test_no_gstin_success(self):
        result = validate_gstin(None)
        assert result is None

    def test_empty_gstin_success(self):
        result = validate_gstin("")
        assert result is None

    def test_blank_gstin_success(self):
        result = validate_gstin("   ")
        assert result is None

    def test_valid_gstin_returns_uppercase(self):
        result = validate_gstin("29ABCDE1234F1Z5")
        assert result == "29ABCDE1234F1Z5"

    def test_valid_gstin_lowercase_normalized(self):
        result = validate_gstin("29abcde1234f1z5")
        assert result == "29ABCDE1234F1Z5"

    def test_invalid_gstin_raises(self):
        try:
            validate_gstin("ABC123")
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "Invalid GSTIN format" in str(e)

    def test_short_gstin_raises(self):
        try:
            validate_gstin("123")
            assert False, "Should have raised ValueError"
        except ValueError:
            pass

    def test_gstin_with_special_chars_raises(self):
        try:
            validate_gstin("29AB@DE1234F1Z5")
            assert False, "Should have raised ValueError"
        except ValueError:
            pass


class TestNumericCoercion:
    def test_none_returns_none(self):
        assert coerce_numeric(None) is None

    def test_empty_string_returns_none(self):
        assert coerce_numeric("") is None

    def test_number_string_coerces(self):
        assert coerce_numeric("500") == 500.0

    def test_integer_coerces(self):
        assert coerce_numeric(500) == 500.0

    def test_float_coerces(self):
        assert coerce_numeric(500.5) == 500.5

    def test_decimal_string_coerces(self):
        assert coerce_numeric("500.75") == 500.75

    def test_invalid_string_returns_none(self):
        assert coerce_numeric("abc") is None

    def test_zero_is_valid(self):
        assert coerce_numeric(0) == 0.0

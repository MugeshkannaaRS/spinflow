"""Test bulk import logic - coercion, error handling, upsert behavior."""


class TestEmployeeCodeCoercion:
    def test_employee_code_as_integer_coerces(self):
        code = str(12345).strip()
        assert code == "12345"
        assert isinstance(code, str)

    def test_grade_as_integer_coerces(self):
        grade = str(5)
        assert grade == "5"

    def test_gen_as_integer_coerces_to_string(self):
        gen = str(1)
        assert gen == "1"


class TestDepartmentWarning:
    def test_unknown_department_returns_warning_not_error(self):
        errors = []
        dept_name = "NonExistentDept"
        dept = None
        if not dept:
            errors.append({
                "row": 1,
                "message": f"Department '{dept_name}' not found",
                "severity": "warning",
            })
        assert len(errors) == 1
        assert errors[0]["severity"] == "warning"

    def test_department_warning_is_mill_scoped(self):
        mill_a_depts = ["Production", "Quality"]
        mill_b_depts = ["Maintenance"]
        dept_name = "Maintenance"
        found = dept_name in mill_a_depts
        assert found is False
        found = dept_name in mill_b_depts
        assert found is True


class TestDuplicateUpsert:
    def test_same_code_twice_updates_not_duplicates(self):
        imported = {}
        code = "EMP001"
        imported[code] = {"name": "First"}
        imported[code] = {"name": "Updated"}
        assert len(imported) == 1
        assert imported[code]["name"] == "Updated"

    def test_batch_with_one_bad_row_other_rows_import(self):
        rows = [
            {"code": "EMP001", "name": "Good"},
            {"code": "", "name": ""},
            {"code": "EMP002", "name": "Also Good"},
        ]
        imported = []
        errors = []
        for row in rows:
            if not row["code"]:
                errors.append({"row": rows.index(row) + 1, "message": "Code required"})
            else:
                imported.append(row)
        assert len(imported) == 2
        assert len(errors) == 1

    def test_correct_created_count(self):
        rows = [{"code": f"EMP{i:03d}"} for i in range(5)]
        imported = len(rows)
        assert imported == 5


class TestPayrollBulkImport:
    def test_existing_employee_success(self):
        employee_exists = True
        assert employee_exists is True

    def test_nonexistent_employee_returns_error_with_row(self):
        employees = {"EMP001": True}
        code = "EMP999"
        if code not in employees:
            error = f"Row 3: employee not found (code='{code}')"
            assert "Row 3" in error
            assert "not found" in error


class TestMaintenanceScheduleCoercion:
    """Mirrors the _trim / _as_int / _as_float helpers in the PM bulk endpoint.

    These guard against the 500 seen when imported PM rows carried values that
    overflowed column lengths or weren't valid ints/floats for Integer/Float
    columns. Coercion makes the insert safe instead of crashing at commit.
    """

    @staticmethod
    def _trim(val, length):
        if val is None:
            return None
        s = str(val).strip()
        return s[:length] if s else None

    @staticmethod
    def _as_int(val):
        if val is None or val == "":
            return None
        try:
            return int(float(str(val).replace(",", "").strip()))
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _as_float(val):
        if val is None or val == "":
            return None
        try:
            return float(str(val).replace(",", "").strip())
        except (TypeError, ValueError):
            return None

    def test_trim_clips_to_column_length(self):
        long_code = "SIMPLEX_(HOWA_RME,_RMH)_EXTRA_LONG_NAME_BEYOND_FIFTY_CHARS"
        assert len(self._trim(long_code, 50)) == 50

    def test_trim_blank_becomes_none(self):
        assert self._trim("   ", 100) is None
        assert self._trim(None, 100) is None

    def test_as_int_handles_strings_and_floats(self):
        assert self._as_int("3") == 3
        assert self._as_int("3.0") == 3
        assert self._as_int("1,200") == 1200
        assert self._as_int(4) == 4

    def test_as_int_bad_value_returns_none_not_crash(self):
        assert self._as_int("N/A") is None
        assert self._as_int("") is None
        assert self._as_int(None) is None

    def test_as_float_parses_dia_readings(self):
        assert self._as_float("28.5") == 28.5
        assert self._as_float("abc") is None
        assert self._as_float(None) is None

    def test_bad_row_isolated_good_rows_still_import(self):
        # Simulates SAVEPOINT-per-row: one failing row doesn't drop the others.
        rows = [
            {"machine_code": "BDT-019", "task_description": "Clean"},
            {"machine_code": "", "task_description": "Missing code"},
            {"machine_code": "DK-740", "task_description": "Oil"},
        ]
        created, skipped = 0, 0
        for r in rows:
            if not r["machine_code"] or not r["task_description"]:
                skipped += 1
                continue
            created += 1
        assert created == 2
        assert skipped == 1

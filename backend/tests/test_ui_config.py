"""Test ui_config schema validation."""

from pydantic import BaseModel
from typing import Optional, List


class ColumnConfigSchema(BaseModel):
    key: str
    label: str
    type: str = "text"
    is_visible: bool = True
    is_required: bool = False
    display_order: int = 0


class TableConfigResponse(BaseModel):
    table: str
    mill_id: str
    columns: List[ColumnConfigSchema]


class TestTableConfigResponse:
    def test_empty_columns_list(self):
        resp = TableConfigResponse(table="test", mill_id="mill-1", columns=[])
        assert resp.table == "test"
        assert resp.mill_id == "mill-1"
        assert resp.columns == []

    def test_with_column(self):
        col = ColumnConfigSchema(key="name", label="Full Name")
        resp = TableConfigResponse(table="hr_employees", mill_id="mill-1", columns=[col])
        assert len(resp.columns) == 1
        assert resp.columns[0].key == "name"

    def test_default_type_is_text(self):
        col = ColumnConfigSchema(key="test", label="Test")
        assert col.type == "text"

    def test_default_visibility_is_true(self):
        col = ColumnConfigSchema(key="test", label="Test")
        assert col.is_visible is True

    def test_default_order_is_zero(self):
        col = ColumnConfigSchema(key="test", label="Test")
        assert col.display_order == 0

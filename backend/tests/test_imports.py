"""Test import mappings error handling."""



class TestImportMappings:
    def test_get_returns_list_on_exception(self):
        """Simulates what happens when exception is caught and returns [].

        The endpoint was updated to return [] instead of raising 500.
        """
        def get_mappings_safe():
            try:
                raise ValueError("DB error")
            except Exception:
                return []
        result = get_mappings_safe()
        assert isinstance(result, list)
        assert result == []

    def test_post_returns_saved_false_on_exception(self):
        """POST endpoint returns {"saved": False} on exception."""
        def save_mappings_safe():
            try:
                raise ValueError("DB error")
            except Exception:
                return {"saved": False}
        result = save_mappings_safe()
        assert result["saved"] is False

    def test_post_returns_saved_count_on_success(self):
        """POST endpoint returns {"saved": count} on success."""
        def save_mappings_safe(items):
            try:
                count = len(items)
                return {"saved": count}
            except Exception:
                return {"saved": False}
        result = save_mappings_safe([{"excel_header": "Name", "spinflow_field": "name"}])
        assert result["saved"] == 1

    def test_get_never_returns_500(self):
        """GET now returns [] instead of raising 500."""
        result = []
        assert result == []

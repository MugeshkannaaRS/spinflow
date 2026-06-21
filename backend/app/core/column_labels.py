"""
column_labels.py — Resolve display labels from MillConfigProfile.field_labels.

The field_labels dict is keyed as "module.field_name" (e.g. "hr.leave_type").
If no override exists, returns None so callers can fall back to defaults.
"""
from __future__ import annotations


def get_column_label(
    module: str,
    field_name: str,
    field_labels: dict[str, str] | None,
) -> str | None:
    """Return the overridden label for (module, field_name), or None."""
    if not field_labels:
        return None
    return field_labels.get(f"{module}.{field_name}")

"""
After any bulk import, call sync_mill_masters() to extract unique values
and populate mill_masters automatically.
Also call sync_custom_fields() to register unknown columns as custom fields.
"""
from __future__ import annotations
import re
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.models.mill_config import MillMaster, MillCustomField

logger = logging.getLogger(__name__)

# Maps raw data field keys → mill_masters category names
FIELD_TO_CATEGORY: dict[str, str] = {
    # employees
    "department":       "department",
    "designation":      "designation",
    "grade":            "grade",
    "shift":            "shift",
    "blood_group":      "blood_group",
    "category":         "employee_category",
    "section":          "section",
    # machines
    "machine_type":     "machine_type",
    "make":             "machine_brand",
    # vehicles
    "vehicle_type":     "vehicle_type",
    # quality / inventory
    "item_category":    "inventory_category",
    "unit":             "unit_of_measure",
    "test_type":        "quality_test_type",
}


async def sync_mill_masters(
    mill_id: str,
    company_id: str,
    module: str,
    rows: list[dict],
    db: AsyncSession,
) -> dict:
    """Extract unique values from imported rows → upsert into mill_masters."""
    batch: list[dict[str, Any]] = []
    now = datetime.now(timezone.utc)

    for field_key, category in FIELD_TO_CATEGORY.items():
        values: set[str] = set()
        for row in rows:
            v = (
                row.get(field_key)
                or row.get(field_key.replace("_", " ").title())
                or row.get(field_key.replace("_", " "))
            )
            if v and str(v).strip() and str(v).strip().lower() not in ("-", "—", "nil", "n/a", "na", "none"):
                values.add(str(v).strip())

        for value in values:
            batch.append({
                "mill_id": mill_id,
                "company_id": company_id,
                "category": category,
                "value": value,
                "source": "import",
                "is_active": True,
                "updated_at": now,
            })

    if not batch:
        return {"synced": 0}

    try:
        stmt = pg_insert(MillMaster).values(batch)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_mill_masters_mill_cat_val",
            set_={"is_active": True, "updated_at": stmt.excluded.updated_at},
        )
        await db.execute(stmt)
        logger.info(f"mill_master_sync: synced {len(batch)} values for mill {mill_id}")
    except Exception as e:
        # Non-critical — log and continue
        logger.warning(f"mill_master_sync failed (non-critical): {e}")

    return {"synced": len(batch)}


async def sync_custom_fields(
    mill_id: str,
    company_id: str,
    module: str,
    headers: list[str],
    sample_rows: list[dict],
    db: AsyncSession,
) -> list[dict]:
    """Detect columns that don't match system fields → register as custom fields."""
    try:
        from app.core.field_aliases import FIELD_ALIASES_BY_MODULE
    except ImportError:
        return []

    # Build set of known system field aliases (lowercase)
    known_fields: set[str] = set()
    for aliases in FIELD_ALIASES_BY_MODULE.get(module, {}).values():
        known_fields.update(a.lower().replace(" ", "_") for a in aliases)
        known_fields.update(a.lower() for a in aliases)

    # Also skip internal markers
    internal = {"_serial_no", "_brand", "_country"}

    custom: list[dict[str, Any]] = []
    for header in headers:
        if header.startswith("_") or header.startswith("__col_"):
            continue
        normalized = header.strip().lower().replace(" ", "_").replace("-", "_")
        original_lower = header.strip().lower()
        if original_lower in known_fields or normalized in known_fields or normalized in internal:
            continue

        samples = [
            str(r.get(header, "")).strip()
            for r in sample_rows[:10]
            if r.get(header) is not None and str(r.get(header, "")).strip()
        ]
        field_type = _infer_field_type(samples)
        dropdown_values: list[str] = []
        if field_type == "dropdown":
            dropdown_values = list({s for s in samples if s})[:20]

        custom.append({
            "mill_id": mill_id,
            "company_id": company_id,
            "module": module,
            "field_key": normalized,
            "field_label": header.strip(),
            "field_type": field_type,
            "dropdown_values": dropdown_values,
            "source": "import",
        })

    if custom:
        try:
            stmt = pg_insert(MillCustomField).values(custom)
            stmt = stmt.on_conflict_do_update(
                constraint="uq_mill_custom_fields",
                set_={"field_label": stmt.excluded.field_label},
            )
            await db.execute(stmt)
        except Exception as e:
            logger.warning(f"sync_custom_fields failed (non-critical): {e}")

    return custom


def _infer_field_type(samples: list[str]) -> str:
    if not samples:
        return "text"
    date_pat = re.compile(r"\d{1,2}[./-]\d{1,2}[./-]\d{2,4}")
    num_pat = re.compile(r"^[\d,. ]+$")
    bool_vals = {"yes", "no", "true", "false", "1", "0", "y", "n"}

    if all(date_pat.match(s) for s in samples):
        return "date"
    if all(num_pat.match(s) for s in samples):
        return "number"
    if all(s.lower() in bool_vals for s in samples):
        return "boolean"
    if len({s.lower() for s in samples}) <= 8:
        return "dropdown"
    return "text"

"""
numbering_service.py — Atomic per-mill, per-document-type sequence generation.

Uses `UPDATE ... RETURNING seq + 1` with row-level locking to prevent
race conditions even under concurrent requests.
"""
from __future__ import annotations
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mill_config import NumberingSequence

logger = logging.getLogger(__name__)


async def get_next_sequence(
    db: AsyncSession,
    mill_id: str,
    doc_type: str,
    prefix: str = "",
) -> dict:
    """Atomically increment and return the next sequence number.

    Creates the sequence row if it doesn't exist, then locks and increments.

    Returns:
        {"seq": N, "prefix": prefix, "doc_type": doc_type}
    """
    # Try to create the row first (safe — UNIQUE constraint prevents dupes)
    try:
        seq_row = NumberingSequence(
            mill_id=mill_id,
            doc_type=doc_type,
            prefix=prefix,
            seq=0,
        )
        db.add(seq_row)
        await db.flush()
    except Exception:
        await db.rollback()
        # Row already exists — proceed to lock and increment

    # Lock the row and increment atomically
    result = await db.execute(
        update(NumberingSequence)
        .where(
            NumberingSequence.mill_id == mill_id,
            NumberingSequence.doc_type == doc_type,
        )
        .values(seq=NumberingSequence.seq + 1)
        .returning(NumberingSequence.seq, NumberingSequence.prefix)
    )
    row = result.one()
    return {
        "seq": row.seq,
        "prefix": row.prefix or "",
        "doc_type": doc_type,
    }

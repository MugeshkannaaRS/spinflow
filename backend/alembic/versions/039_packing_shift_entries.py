"""039 — Packing Shift Entries (lot+count bag-range production log)

Revision ID: 039
Revises: 038
Create Date: 2026-06-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "039"
down_revision: Union[str, None] = "038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "packing_shift_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False),
        sa.Column("date", sa.String(10), nullable=False),
        sa.Column("shift", sa.String(5), nullable=False),           # A / B / C
        sa.Column("lot_no", sa.String(50), nullable=False),
        sa.Column("count_ne", sa.Float, nullable=True),             # e.g. 30.0
        sa.Column("count_desc", sa.String(200), nullable=True),     # "100% combed cotton"
        sa.Column("bag_from", sa.Integer, nullable=True),           # starting bag serial
        sa.Column("bag_to", sa.Integer, nullable=True),             # ending bag serial
        sa.Column("total_bags", sa.Integer, nullable=True),         # auto = bag_to - bag_from + 1
        sa.Column("machine_code", sa.String(20), nullable=True),
        sa.Column("operator", sa.String(100), nullable=True),
        sa.Column("supervisor", sa.String(100), nullable=True),
        sa.Column("remarks", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_pse_mill_date_shift", "packing_shift_entries", ["mill_id", "date", "shift"])
    op.create_index("ix_pse_mill_lot", "packing_shift_entries", ["mill_id", "lot_no"])


def downgrade() -> None:
    op.drop_index("ix_pse_mill_lot", "packing_shift_entries")
    op.drop_index("ix_pse_mill_date_shift", "packing_shift_entries")
    op.drop_table("packing_shift_entries")

"""Add learner_allocations and learner_allocation_entries tables

Revision ID: 055
Revises: 054
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "055"
down_revision = "054"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "learner_allocations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("allocation_date", sa.Date(), nullable=False),
        sa.Column("shift", sa.String(10), nullable=False),  # morning / evening / night
        sa.Column("allocation_type", sa.String(10), nullable=True),  # P/c, R/c
        sa.Column("total_persons", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("submitted_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    op.create_index("ix_learner_allocations_mill_date", "learner_allocations", ["mill_id", "allocation_date"])
    op.create_index("ix_learner_allocations_date_shift", "learner_allocations", ["allocation_date", "shift"])

    op.create_table(
        "learner_allocation_entries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("allocation_id", sa.String(36), sa.ForeignKey("learner_allocations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("section", sa.String(50), nullable=False),   # carding, drawing, simplex, ring, mc, floor_cleaner, finishing, extra
        sa.Column("machine_no", sa.String(50), nullable=True),
        sa.Column("card_no_a", sa.String(50), nullable=True),  # primary / R/A
        sa.Column("card_no_b", sa.String(50), nullable=True),  # R/B (ring unit)
        sa.Column("sub_label", sa.String(100), nullable=True), # House keeper, Oiling, Relieving…
        sa.Column("display_order", sa.Integer(), default=0),
    )


def downgrade():
    op.drop_table("learner_allocation_entries")
    op.drop_index("ix_learner_allocations_date_shift", "learner_allocations")
    op.drop_index("ix_learner_allocations_mill_date", "learner_allocations")
    op.drop_table("learner_allocations")

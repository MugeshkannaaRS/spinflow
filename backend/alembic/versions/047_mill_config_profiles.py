"""047 - Mill configuration profiles + numbering sequences

Revision ID: 047
Revises: 046
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "047"
down_revision = "046"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mill_configuration_profiles",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, unique=True, index=True),
        sa.Column("field_labels", JSONB, nullable=True, server_default="{}"),
        sa.Column("dropdown_options", JSONB, nullable=True, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_table(
        "numbering_sequences",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("doc_type", sa.String(50), nullable=False),
        sa.Column("prefix", sa.String(20), nullable=True),
        sa.Column("seq", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("mill_id", "doc_type"),
    )
    op.create_index("ix_numbering_sequences_lookup", "numbering_sequences", ["mill_id", "doc_type"])


def downgrade():
    op.drop_table("numbering_sequences")
    op.drop_table("mill_configuration_profiles")

"""Add machine_waste_type_templates table

Revision ID: 051_machine_waste_type_templates
Revises: 050_carding_waste_individual_pct
Create Date: 2026-06-22

Stores the remembered waste types for each machine or machine group.
When operator first enters waste types for a machine/group, they are saved here.
Subsequent shifts auto-load these types so operator only fills weight + ratio.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '051_machine_waste_type_templates'
down_revision = '050_carding_waste_individual_pct'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'machine_waste_type_templates',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('mill_id', sa.String(36), sa.ForeignKey('mills.id'), nullable=False, index=True),
        sa.Column('machine_code', sa.String(50), nullable=True),       # null = group-level
        sa.Column('machine_group_id', sa.String(36), nullable=True),   # null = individual machine
        sa.Column('department', sa.String(50), nullable=True),
        # waste_types: [{"waste_type": "Fly waste", "ratio": "60:40", "sort_order": 0}, ...]
        sa.Column('waste_types', postgresql.JSONB, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    # Unique: one template per machine_code per mill
    op.create_index('ix_mwtt_mill_machine', 'machine_waste_type_templates', ['mill_id', 'machine_code'])
    # Unique: one template per machine_group_id per mill
    op.create_index('ix_mwtt_mill_group', 'machine_waste_type_templates', ['mill_id', 'machine_group_id'])


def downgrade() -> None:
    op.drop_index('ix_mwtt_mill_group', table_name='machine_waste_type_templates')
    op.drop_index('ix_mwtt_mill_machine', table_name='machine_waste_type_templates')
    op.drop_table('machine_waste_type_templates')

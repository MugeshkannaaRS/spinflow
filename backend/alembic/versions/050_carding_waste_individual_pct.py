"""Add individual waste % columns to qm_carding_waste_study

Revision ID: 050_carding_waste_individual_pct
Revises: 049
Create Date: 2026-06-22

Each waste kg field now gets a corresponding computed % column:
  licker_in2_waste_pct, licker_in3_waste_pct, flat_strips_pct,
  suction_hood_back_pct, suction_hood_front_pct

Formula: waste_pct = (waste_kg / total_production_kg) * 100
"""
from alembic import op
import sqlalchemy as sa

revision = '050_carding_waste_individual_pct'
down_revision = '049'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('qm_carding_waste_study', sa.Column('licker_in2_waste_pct', sa.Float(), nullable=True))
    op.add_column('qm_carding_waste_study', sa.Column('licker_in3_waste_pct', sa.Float(), nullable=True))
    op.add_column('qm_carding_waste_study', sa.Column('flat_strips_pct',       sa.Float(), nullable=True))
    op.add_column('qm_carding_waste_study', sa.Column('suction_hood_back_pct', sa.Float(), nullable=True))
    op.add_column('qm_carding_waste_study', sa.Column('suction_hood_front_pct', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('qm_carding_waste_study', 'suction_hood_front_pct')
    op.drop_column('qm_carding_waste_study', 'suction_hood_back_pct')
    op.drop_column('qm_carding_waste_study', 'flat_strips_pct')
    op.drop_column('qm_carding_waste_study', 'licker_in3_waste_pct')
    op.drop_column('qm_carding_waste_study', 'licker_in2_waste_pct')

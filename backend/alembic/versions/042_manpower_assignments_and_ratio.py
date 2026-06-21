"""manpower assignments JSONB + machines_per_person

Revision ID: 042
Revises: 041
Create Date: 2026-06-21

Adds two columns to rf_manpower_plan:
  - assignments  JSONB  — list of {name, emp_id, mc_from, mc_to} per person
  - machines_per_person INTEGER — coverage ratio (e.g. 6 for Robo Doffer)
"""
from typing import Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "042"
down_revision: Union[str, None] = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE rf_manpower_plan "
        "ADD COLUMN IF NOT EXISTS assignments JSONB DEFAULT '[]'::jsonb"
    )
    op.execute(
        "ALTER TABLE rf_manpower_plan "
        "ADD COLUMN IF NOT EXISTS machines_per_person INTEGER"
    )


def downgrade() -> None:
    with op.batch_alter_table("rf_manpower_plan") as batch_op:
        batch_op.drop_column("machines_per_person")
        batch_op.drop_column("assignments")

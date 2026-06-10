"""Fix stop_from/stop_to column types: TIME → VARCHAR(5) to match ORM model

Revision ID: 022
Revises: 021
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op

revision: str = "022"
down_revision: Union[str, None] = "021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cast TIME → VARCHAR(5) — store as "HH:MM" strings (matches ORM String(5) mapping)
    op.execute("""
        ALTER TABLE downtime_logs
            ALTER COLUMN stop_from TYPE VARCHAR(5)
                USING to_char(stop_from, 'HH24:MI'),
            ALTER COLUMN stop_to TYPE VARCHAR(5)
                USING to_char(stop_to, 'HH24:MI')
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE downtime_logs
            ALTER COLUMN stop_from TYPE TIME
                USING stop_from::TIME,
            ALTER COLUMN stop_to TYPE TIME
                USING stop_to::TIME
    """)

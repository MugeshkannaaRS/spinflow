"""Fix employee code unique constraint: global → (code, mill_id)

Revision ID: 021
Revises: 020
Create Date: 2026-06-11 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the old global unique index on code only
    op.execute("DROP INDEX IF EXISTS ix_employees_code")

    # Add composite unique constraint (code, mill_id)
    # IF NOT EXISTS not supported on CONSTRAINT name — use DO block to be safe
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_employees_code_mill'
                  AND conrelid = 'employees'::regclass
            ) THEN
                ALTER TABLE employees
                    ADD CONSTRAINT uq_employees_code_mill UNIQUE (code, mill_id);
            END IF;
        END;
        $$
    """)

    # Re-create a non-unique index on code for fast lookups
    op.execute("CREATE INDEX IF NOT EXISTS ix_employees_code ON employees (code)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_employees_code")
    op.execute("ALTER TABLE employees DROP CONSTRAINT IF EXISTS uq_employees_code_mill")
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_employees_code ON employees (code)")

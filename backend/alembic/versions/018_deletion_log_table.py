"""Create deletion_log table

Revision ID: 018
Revises: 017
Create Date: 2026-06-07 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "018"
down_revision: Union[str, None] = "017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS deletion_log (
        id              VARCHAR(36) PRIMARY KEY,
        company_id      VARCHAR(36) NOT NULL,
        company_name    VARCHAR(200) NOT NULL,
        company_code    VARCHAR(50) NOT NULL,
        deleted_by      VARCHAR(36) NOT NULL,
        deleted_by_name VARCHAR(200),
        deleted_at      TIMESTAMPTZ DEFAULT NOW(),
        affected_records JSONB,
        backup_location VARCHAR(500),
        backup_key      VARCHAR(200),
        deletion_result VARCHAR(50) NOT NULL DEFAULT 'success',
        error_message   TEXT,
        mode            VARCHAR(20) NOT NULL DEFAULT 'hard'
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_deletion_log_company_id ON deletion_log (company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_deletion_log_deleted_at ON deletion_log (deleted_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS deletion_log CASCADE")

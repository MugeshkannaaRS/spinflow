"""036 — Fix schema drift between models and actual database schema

Adds columns that exist in model definitions but were never created by
previous migrations (companies.status, overdue columns, etc.), renames
metadata columns that clash with SQLAlchemy reserved names, and makes
audit_logs.user_id nullable.

Revision ID: 036
Revises: 035
Create Date: 2026-06-12
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "036"
down_revision: Union[str, None] = "035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. companies.status + suspended_at + archived_at ─────────────────────
    # Model has these; SQL 008 creates them but no alembic migration does
    for col, dtype in [
        ("status", "VARCHAR(20)"),
        ("suspended_at", "TIMESTAMPTZ"),
        ("archived_at", "TIMESTAMPTZ"),
    ]:
        result = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'companies' AND column_name = :col"
            ),
            {"col": col},
        ).fetchone()
        if not result:
            nullable = "NULL" if col == "status" else "NULL"
            default = "DEFAULT 'active'" if col == "status" else ""
            conn.execute(
                sa.text(f"ALTER TABLE companies ADD COLUMN {col} {dtype} {nullable} {default}")
            )

    # ── 2. company_subscriptions.overdue_status + overdue_since ──────────────
    # Model has these; never created by any alembic migration
    for col, dtype in [
        ("overdue_status", "VARCHAR(20)"),
        ("overdue_since", "TIMESTAMPTZ"),
    ]:
        result = conn.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'company_subscriptions' AND column_name = :col"
            ),
            {"col": col},
        ).fetchone()
        if not result:
            nullable = "NULL" if col == "overdue_since" else "NOT NULL"
            default = "DEFAULT 'active'" if col == "overdue_status" else ""
            conn.execute(
                sa.text(f"ALTER TABLE company_subscriptions ADD COLUMN {col} {dtype} {nullable} {default}")
            )

    # ── 3. audit_logs.user_id → nullable ─────────────────────────────────────
    # Model says nullable=True; migration 001 created NOT NULL.
    # callers pass None for "SYSTEM" actions (billing_invoice_service.py)
    result = conn.execute(
        sa.text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'audit_logs' AND column_name = 'user_id'"
        )
    ).fetchone()
    if result and result[0] == "NO":
        conn.execute(sa.text("ALTER TABLE audit_logs ALTER COLUMN user_id DROP NOT NULL"))

    # ── 4. billing_invoices: rename metadata → invoice_metadata ──────────────
    has_metadata = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'billing_invoices' AND column_name = 'metadata'"
        )
    ).fetchone()
    has_invoice_metadata = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'billing_invoices' AND column_name = 'invoice_metadata'"
        )
    ).fetchone()
    if has_metadata and not has_invoice_metadata:
        conn.execute(sa.text("ALTER TABLE billing_invoices RENAME COLUMN metadata TO invoice_metadata"))
    elif has_metadata and has_invoice_metadata:
        # Both exist — drop the old one (model uses invoice_metadata)
        conn.execute(sa.text("ALTER TABLE billing_invoices DROP COLUMN metadata"))

    # ── 5. subscription_change_requests: rename metadata → request_metadata ──
    has_metadata = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'subscription_change_requests' AND column_name = 'metadata'"
        )
    ).fetchone()
    has_request_metadata = conn.execute(
        sa.text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'subscription_change_requests' AND column_name = 'request_metadata'"
        )
    ).fetchone()
    if has_metadata and not has_request_metadata:
        conn.execute(
            sa.text("ALTER TABLE subscription_change_requests RENAME COLUMN metadata TO request_metadata")
        )
    elif has_metadata and has_request_metadata:
        conn.execute(sa.text("ALTER TABLE subscription_change_requests DROP COLUMN metadata"))


def downgrade() -> None:
    # Downgrade is not safe for data changes — columns would need to be
    # re-created and data loss would occur. Set down_revision to None
    # for irreversible migration.
    pass

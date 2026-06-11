"""Wave 5 — Billing Commerce Platform: addon_pricing table,
cancellation columns on company_subscriptions, included_machines on plans.

All operations are additive / idempotent (IF NOT EXISTS guards).
No existing data is touched.

Revision ID: 029
Revises: 028
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "029"
down_revision: Union[str, None] = "028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _col_exists(table: str, col_name: str, col_def: str) -> str:
    return f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = '{table}' AND column_name = '{col_name}'
            ) THEN
                ALTER TABLE {table} ADD COLUMN {col_name} {col_def};
            END IF;
        END $$;
    """


def _table_exists(table: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            f"WHERE table_name = '{table}')"
        )
    ).scalar()
    return result


def upgrade() -> None:

    # ── 1. addon_pricing table ────────────────────────────────────────────
    if not _table_exists("addon_pricing"):
        op.create_table(
            "addon_pricing",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("module_code", sa.String(100), unique=True, nullable=False, index=True),
            sa.Column("label", sa.String(200), nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("monthly_price", sa.Numeric(12, 2), default=0),
            sa.Column("yearly_price", sa.Numeric(12, 2), default=0),
            sa.Column("category", sa.String(50), default="addon"),
            sa.Column("is_active", sa.Boolean, default=True),
            sa.Column("sort_order", sa.Integer, default=0),
            sa.Column(
                "created_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at", sa.DateTime(timezone=True),
                server_default=sa.func.now(),
            ),
        )

    # ── 2. CompanySubscription cancellation columns ───────────────────────
    op.execute(_col_exists("company_subscriptions", "cancellation_reason",    "VARCHAR(500)"))
    op.execute(_col_exists("company_subscriptions", "cancellation_effective", "TIMESTAMPTZ"))
    op.execute(_col_exists("company_subscriptions", "cancelled_by",           "VARCHAR(36)"))

    # ── 3. included_machines on subscription_plans ────────────────────────
    op.execute(_col_exists("subscription_plans", "included_machines", "INTEGER DEFAULT 50"))


def downgrade() -> None:
    op.drop_table("addon_pricing")
    op.drop_column("company_subscriptions", "cancellation_reason")
    op.drop_column("company_subscriptions", "cancellation_effective")
    op.drop_column("company_subscriptions", "cancelled_by")
    op.drop_column("subscription_plans", "included_machines")

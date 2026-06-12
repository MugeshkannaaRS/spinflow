"""037 — Add 14 missing foreign key indexes for query performance

Without these indexes, JOIN queries on FK columns trigger full table scans,
causing O(n*m) performance that degrades linearly with data growth.

Revision ID: 037
Revises: 036
Create Date: 2026-06-12
"""
from typing import Sequence, Union
from alembic import op

revision: str = "037"
down_revision: Union[str, None] = "036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column, index_name)
INDEXES = [
    ("billing_payments", "entered_by", "ix_billing_payments_entered_by"),
    ("company_subscriptions", "plan_id", "ix_company_subscriptions_plan_id"),
    ("subscription_change_requests", "current_plan_id", "ix_scr_current_plan_id"),
    ("subscription_change_requests", "requested_plan_id", "ix_scr_requested_plan_id"),
    ("subscription_change_requests", "requested_by", "ix_scr_requested_by"),
    ("subscription_change_requests", "reviewed_by", "ix_scr_reviewed_by"),
    ("alert_acknowledgements", "user_id", "ix_alert_acknowledgements_user_id"),
    ("alert_events", "acknowledged_by", "ix_alert_events_acknowledged_by"),
    ("alert_events", "resolved_by", "ix_alert_events_resolved_by"),
    ("alert_rules", "mill_id", "ix_alert_rules_mill_id"),
    ("escalation_policies", "company_id", "ix_escalation_policies_company_id"),
    ("company_modules", "enabled_by", "ix_company_modules_enabled_by"),
    ("laydown_records", "recipe_id", "ix_laydown_records_recipe_id"),
    ("bale_consumption_log", "laydown_id", "ix_bale_consumption_log_laydown_id"),
]


def upgrade() -> None:
    conn = op.get_bind()
    for table, column, index_name in INDEXES:
        result = conn.execute(
            op.text(
                "SELECT 1 FROM pg_indexes WHERE indexname = :idx"
            ),
            {"idx": index_name},
        ).fetchone()
        if not result:
            op.create_index(index_name, table, [column])
            print(f"  Created index {index_name} on {table}({column})")
        else:
            print(f"  Index {index_name} already exists — skipping")


def downgrade() -> None:
    for _, _, index_name in INDEXES:
        op.drop_index(index_name, if_exists=True)

"""Add missing composite indexes on alert_events for W4B escalation loop,
ops-center feed, and cooldown dedup queries.

Revision ID: 031
Revises: 030
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision: str = "031"
down_revision: Union[str, None] = "030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Escalation loop: WHERE status IN ('OPEN','ESCALATED') AND next_escalation_at <= NOW()
    op.create_index(
        "ix_alert_events_next_escalation",
        "alert_events",
        ["next_escalation_at", "status"],
        postgresql_where=text("next_escalation_at IS NOT NULL"),
    )
    # Ops center feed: WHERE company_id = ? AND status = ? ORDER BY created_at DESC
    op.create_index(
        "ix_alert_events_company_status_created",
        "alert_events",
        ["company_id", "status", "created_at"],
    )
    # Cooldown dedup: WHERE rule_id = ? AND source_id = ? AND company_id = ?
    #   AND status NOT IN ('RESOLVED') AND created_at >= ?
    op.create_index(
        "ix_alert_events_cooldown",
        "alert_events",
        ["rule_id", "source_id", "company_id", "status", "created_at"],
    )
    # Escalation policy lookup: WHERE category = ? AND severity = ? AND step = ?
    op.create_index(
        "ix_escalation_policies_category_sev_step",
        "escalation_policies",
        ["category", "severity", "step"],
    )


def downgrade() -> None:
    op.drop_index("ix_alert_events_next_escalation", table_name="alert_events")
    op.drop_index("ix_alert_events_company_status_created", table_name="alert_events")
    op.drop_index("ix_alert_events_cooldown", table_name="alert_events")
    op.drop_index("ix_escalation_policies_category_sev_step", table_name="escalation_policies")

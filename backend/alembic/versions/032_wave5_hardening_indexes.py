"""Wave 5 Hardening — Add missing indexes for approval/backup/incident queries.

Revises: 031
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "032"
down_revision: Union[str, None] = "031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Approval Engine indexes ──────────────────────────────────────
    op.create_index("idx_approval_steps_assignee_role", "approval_steps", ["assignee_role"], postgresql_where=sa.text("assignee_role IS NOT NULL"))
    op.create_index("idx_approval_steps_assignee_user", "approval_steps", ["assignee_user_id"], postgresql_where=sa.text("assignee_user_id IS NOT NULL"))
    op.create_index("idx_approval_actions_actor", "approval_actions", ["actor_id"])
    op.create_index("idx_approval_requests_requested_by", "approval_requests", ["requested_by"])

    # ── Backup/DR indexes ────────────────────────────────────────────
    op.create_index("idx_backup_jobs_status", "backup_jobs", ["status"])

    # ── Incident indexes ─────────────────────────────────────────────
    op.create_index("idx_incidents_status", "incidents", ["status"])
    op.create_index("idx_incidents_severity", "incidents", ["severity"])

    # ── Billing indexes ──────────────────────────────────────────────
    op.create_index("idx_company_subscriptions_overdue_status", "company_subscriptions", ["overdue_status"], postgresql_where=sa.text("overdue_status IS NOT NULL AND overdue_status != 'none'"))

    # ── Addon pricing indexes ────────────────────────────────────────
    op.create_index("idx_addon_pricing_active", "addon_pricing", ["is_active"], postgresql_where=sa.text("is_active = true"))
    op.create_index("idx_addon_pricing_category", "addon_pricing", ["category"])


def downgrade() -> None:
    op.drop_index("idx_approval_steps_assignee_role", table_name="approval_steps")
    op.drop_index("idx_approval_steps_assignee_user", table_name="approval_steps")
    op.drop_index("idx_approval_actions_actor", table_name="approval_actions")
    op.drop_index("idx_approval_requests_requested_by", table_name="approval_requests")
    op.drop_index("idx_backup_jobs_status", table_name="backup_jobs")
    op.drop_index("idx_incidents_status", table_name="incidents")
    op.drop_index("idx_incidents_severity", table_name="incidents")
    op.drop_index("idx_company_subscriptions_overdue_status", table_name="company_subscriptions")
    op.drop_index("idx_addon_pricing_active", table_name="addon_pricing")
    op.drop_index("idx_addon_pricing_category", table_name="addon_pricing")

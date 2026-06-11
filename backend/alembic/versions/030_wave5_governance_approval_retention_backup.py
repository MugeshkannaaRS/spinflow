"""Wave 5 — Governance, Approval Engine, Retention, Backup/DR,
Platform models.

All operations are additive / idempotent (IF NOT EXISTS guards).
No existing data is touched.

Revision ID: 030
Revises: 029
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "030"
down_revision: Union[str, None] = "029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
    tables = [
        ("permission_sets", """
            CREATE TABLE permission_sets (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                permissions JSONB DEFAULT '{}',
                is_active BOOLEAN DEFAULT TRUE,
                created_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_permission_sets_company ON permission_sets(company_id);
        """),
        ("security_policies", """
            CREATE TABLE security_policies (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
                min_password_length INTEGER DEFAULT 8,
                require_mfa BOOLEAN DEFAULT FALSE,
                session_timeout_minutes INTEGER DEFAULT 480,
                max_failed_logins INTEGER DEFAULT 5,
                ip_whitelist JSONB DEFAULT '[]',
                allowed_domains JSONB DEFAULT '[]',
                password_expiry_days INTEGER DEFAULT 90,
                require_special_char BOOLEAN DEFAULT TRUE,
                require_upper_lower BOOLEAN DEFAULT TRUE,
                created_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_security_policies_company ON security_policies(company_id);
        """),
        ("company_branding", """
            CREATE TABLE company_branding (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
                primary_color VARCHAR(7) DEFAULT '#0f1923',
                secondary_color VARCHAR(7) DEFAULT '#0d9488',
                logo_url VARCHAR(500),
                favicon_url VARCHAR(500),
                custom_domain VARCHAR(200),
                email_header_html TEXT,
                email_footer_html TEXT,
                updated_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_company_branding_company ON company_branding(company_id);
        """),
        ("approval_workflows", """
            CREATE TABLE approval_workflows (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                name VARCHAR(200) NOT NULL,
                description TEXT,
                entity_type VARCHAR(50) NOT NULL,
                module VARCHAR(50),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_approval_workflows_company ON approval_workflows(company_id);
            CREATE INDEX idx_approval_workflows_entity ON approval_workflows(entity_type);
        """),
        ("approval_steps", """
            CREATE TABLE approval_steps (
                id VARCHAR(36) PRIMARY KEY,
                workflow_id VARCHAR(36) NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
                step_order INTEGER NOT NULL,
                label VARCHAR(200) DEFAULT 'Approve',
                assignee_role VARCHAR(50),
                assignee_user_id VARCHAR(36) REFERENCES users(id),
                timeout_hours INTEGER DEFAULT 48,
                escalation_role VARCHAR(50),
                action_if_timeout VARCHAR(20) DEFAULT 'escalate',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_approval_steps_workflow ON approval_steps(workflow_id);
        """),
        ("approval_requests", """
            CREATE TABLE approval_requests (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                workflow_id VARCHAR(36) NOT NULL REFERENCES approval_workflows(id),
                entity_type VARCHAR(50) NOT NULL,
                entity_id VARCHAR(36) NOT NULL,
                entity_summary VARCHAR(500),
                requested_by VARCHAR(36) NOT NULL REFERENCES users(id),
                status VARCHAR(20) DEFAULT 'pending',
                current_step_index INTEGER DEFAULT 0,
                metadata_json JSONB DEFAULT '{}',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_approval_requests_company ON approval_requests(company_id);
            CREATE INDEX idx_approval_requests_status ON approval_requests(status);
            CREATE INDEX idx_approval_requests_entity ON approval_requests(entity_type, entity_id);
        """),
        ("approval_actions", """
            CREATE TABLE approval_actions (
                id VARCHAR(36) PRIMARY KEY,
                request_id VARCHAR(36) NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
                step_index INTEGER NOT NULL,
                actor_id VARCHAR(36) NOT NULL REFERENCES users(id),
                action VARCHAR(20) NOT NULL,
                comment TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_approval_actions_request ON approval_actions(request_id);
        """),
        ("retention_policies", """
            CREATE TABLE retention_policies (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE,
                entity_type VARCHAR(50) NOT NULL,
                severity VARCHAR(20),
                retention_days INTEGER NOT NULL,
                action VARCHAR(20) DEFAULT 'archive',
                is_active BOOLEAN DEFAULT TRUE,
                created_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_retention_policies_company ON retention_policies(company_id);
        """),
        ("backup_jobs", """
            CREATE TABLE backup_jobs (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE SET NULL,
                backup_type VARCHAR(20) DEFAULT 'full',
                status VARCHAR(20) DEFAULT 'pending',
                file_path VARCHAR(500),
                file_size_bytes BIGINT,
                rows_backed_up INTEGER,
                checksum VARCHAR(64),
                error_message TEXT,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                triggered_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_backup_jobs_company ON backup_jobs(company_id);
        """),
        ("backup_restores", """
            CREATE TABLE backup_restores (
                id VARCHAR(36) PRIMARY KEY,
                backup_job_id VARCHAR(36) NOT NULL REFERENCES backup_jobs(id) ON DELETE SET NULL,
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE SET NULL,
                status VARCHAR(20) DEFAULT 'pending',
                tables_restored INTEGER,
                rows_restored INTEGER,
                error_message TEXT,
                is_dry_run BOOLEAN DEFAULT FALSE,
                requested_by VARCHAR(36) NOT NULL REFERENCES users(id),
                completed_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_backup_restores_backup ON backup_restores(backup_job_id);
        """),
        ("health_check_results", """
            CREATE TABLE health_check_results (
                id VARCHAR(36) PRIMARY KEY,
                component VARCHAR(50) NOT NULL,
                status VARCHAR(20) NOT NULL,
                latency_ms INTEGER,
                error_message TEXT,
                details JSONB DEFAULT '{}',
                checked_at TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_health_check_component ON health_check_results(component);
        """),
        ("incidents", """
            CREATE TABLE incidents (
                id VARCHAR(36) PRIMARY KEY,
                component VARCHAR(50) NOT NULL,
                severity VARCHAR(20) NOT NULL,
                title VARCHAR(300) NOT NULL,
                description TEXT,
                status VARCHAR(20) DEFAULT 'open',
                started_at TIMESTAMPTZ NOT NULL,
                resolved_at TIMESTAMPTZ,
                duration_minutes INTEGER,
                resolution_notes TEXT,
                reported_by VARCHAR(36) REFERENCES users(id),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """),
        ("storage_usage", """
            CREATE TABLE storage_usage (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                upload_bytes BIGINT DEFAULT 0,
                db_estimate_bytes BIGINT,
                snapshot_date TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_storage_usage_company ON storage_usage(company_id);
            CREATE INDEX idx_storage_usage_date ON storage_usage(snapshot_date);
        """),
        ("api_usage", """
            CREATE TABLE api_usage (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
                endpoint VARCHAR(200),
                method VARCHAR(10),
                call_count INTEGER DEFAULT 0,
                date TIMESTAMPTZ DEFAULT NOW(),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX idx_api_usage_company ON api_usage(company_id);
            CREATE INDEX idx_api_usage_date ON api_usage(date);
        """),
    ]

    for table_name, ddl in tables:
        if not _table_exists(table_name):
            op.execute(ddl)


def downgrade() -> None:
    tables = [
        "api_usage", "storage_usage", "incidents", "health_check_results",
        "backup_restores", "backup_jobs", "retention_policies",
        "approval_actions", "approval_requests", "approval_steps", "approval_workflows",
        "company_branding", "security_policies", "permission_sets",
    ]
    for table in tables:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

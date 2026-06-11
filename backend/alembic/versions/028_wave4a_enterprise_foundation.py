"""Wave 4A — Enterprise foundation: extend audit_logs + add notifications,
   alert_rules, alert_events, escalation_policies, usage_snapshots tables.

All operations are additive / idempotent (IF NOT EXISTS / IF EXISTS guards).
No existing data is touched.

Revision ID: 028
Revises: 027
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op

revision: str = "028"
down_revision: Union[str, None] = "027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _col_exists(table: str, column: str) -> str:
    """Return a DO block that adds a column only if it does not already exist."""
    return f"""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = '{table}' AND column_name = '{column}'
            ) THEN
                ALTER TABLE {table} ADD COLUMN {column};
            END IF;
        END $$;
    """


# ---------------------------------------------------------------------------
# Upgrade
# ---------------------------------------------------------------------------

def upgrade() -> None:

    # ── 1. Extend audit_logs ─────────────────────────────────────────────
    op.execute(_col_exists("audit_logs", "category     VARCHAR(50)  DEFAULT 'USER_ACTIVITY'"))
    op.execute(_col_exists("audit_logs", "severity     VARCHAR(20)  DEFAULT 'INFO'"))
    op.execute(_col_exists("audit_logs", "entity_name  VARCHAR(200)"))
    op.execute(_col_exists("audit_logs", "mill_name    VARCHAR(200)"))
    op.execute(_col_exists("audit_logs", "company_name VARCHAR(200)"))
    op.execute(_col_exists("audit_logs", "company_id   VARCHAR(36)"))
    op.execute(_col_exists("audit_logs", "mill_id      VARCHAR(36)"))
    op.execute(_col_exists("audit_logs", "module       VARCHAR(100)"))
    op.execute(_col_exists("audit_logs", "metadata_json JSONB"))
    op.execute(_col_exists("audit_logs", "archived_at  TIMESTAMPTZ"))
    op.execute(_col_exists("audit_logs", "deleted_at   TIMESTAMPTZ"))
    op.execute(_col_exists("audit_logs", "deleted_by   VARCHAR(36)"))

    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_category   ON audit_logs (category)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_severity   ON audit_logs (severity)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_company_id ON audit_logs (company_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_mill_id    ON audit_logs (mill_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_module     ON audit_logs (module)")

    # ── 2. notifications ─────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id           VARCHAR(36)  PRIMARY KEY,
            company_id   VARCHAR(36)  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            mill_id      VARCHAR(36)  REFERENCES mills(id) ON DELETE SET NULL,
            user_id      VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title        VARCHAR(200) NOT NULL,
            message      TEXT,
            severity     VARCHAR(20)  DEFAULT 'INFO',
            category     VARCHAR(50)  DEFAULT 'SYSTEM',
            icon         VARCHAR(50),
            action_url   VARCHAR(500),
            priority     VARCHAR(20)  DEFAULT 'MEDIUM',
            source_type  VARCHAR(100),
            source_id    VARCHAR(36),
            is_read      BOOLEAN      DEFAULT FALSE,
            is_archived  BOOLEAN      DEFAULT FALSE,
            metadata     JSONB        DEFAULT '{}',
            created_at   TIMESTAMPTZ  DEFAULT NOW(),
            read_at      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_unread "
               "ON notifications (user_id, is_read, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_company "
               "ON notifications (company_id, created_at DESC)")

    # ── 3. alert_rules ───────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_rules (
            id               VARCHAR(36)  PRIMARY KEY,
            company_id       VARCHAR(36)  REFERENCES companies(id) ON DELETE CASCADE,
            mill_id          VARCHAR(36)  REFERENCES mills(id) ON DELETE SET NULL,
            name             VARCHAR(200) NOT NULL,
            description      TEXT,
            category         VARCHAR(50)  NOT NULL,
            condition_type   VARCHAR(100) NOT NULL,
            threshold_value  NUMERIC(12,4),
            threshold_unit   VARCHAR(50),
            severity         VARCHAR(20)  NOT NULL DEFAULT 'WARNING',
            target_roles     JSONB        DEFAULT '[]',
            is_active        BOOLEAN      DEFAULT TRUE,
            is_system        BOOLEAN      DEFAULT FALSE,
            cooldown_minutes INTEGER      DEFAULT 60,
            created_at       TIMESTAMPTZ  DEFAULT NOW(),
            updated_at       TIMESTAMPTZ  DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_rules_company "
               "ON alert_rules (company_id, is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_rules_category "
               "ON alert_rules (category, condition_type)")

    # ── 4. alert_events ──────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_events (
            id                  VARCHAR(36)  PRIMARY KEY,
            rule_id             VARCHAR(36)  REFERENCES alert_rules(id) ON DELETE SET NULL,
            company_id          VARCHAR(36)  NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            mill_id             VARCHAR(36)  REFERENCES mills(id) ON DELETE SET NULL,
            source_type         VARCHAR(100),
            source_id           VARCHAR(36),
            source_data         JSONB        DEFAULT '{}',
            title               VARCHAR(200) NOT NULL,
            message             TEXT,
            severity            VARCHAR(20)  NOT NULL DEFAULT 'WARNING',
            category            VARCHAR(50)  NOT NULL,
            status              VARCHAR(20)  DEFAULT 'OPEN',
            target_role         VARCHAR(50),
            acknowledged_by     VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
            acknowledged_at     TIMESTAMPTZ,
            resolved_by         VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL,
            resolved_at         TIMESTAMPTZ,
            escalation_level    INTEGER      DEFAULT 0,
            next_escalation_at  TIMESTAMPTZ,
            created_at          TIMESTAMPTZ  DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_events_company_status "
               "ON alert_events (company_id, status, created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_events_mill "
               "ON alert_events (mill_id, status) WHERE mill_id IS NOT NULL")
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_events_escalation "
               "ON alert_events (next_escalation_at) WHERE status = 'OPEN'")
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_events_severity "
               "ON alert_events (severity, status)")

    # ── 5. alert_acknowledgements ────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS alert_acknowledgements (
            id              VARCHAR(36)  PRIMARY KEY,
            alert_event_id  VARCHAR(36)  NOT NULL REFERENCES alert_events(id) ON DELETE CASCADE,
            user_id         VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            action          VARCHAR(30)  NOT NULL DEFAULT 'ACKNOWLEDGED',
            notes           TEXT,
            created_at      TIMESTAMPTZ  DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_alert_acks_event "
               "ON alert_acknowledgements (alert_event_id)")

    # ── 6. escalation_policies ───────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS escalation_policies (
            id               VARCHAR(36)  PRIMARY KEY,
            company_id       VARCHAR(36)  REFERENCES companies(id) ON DELETE CASCADE,
            category         VARCHAR(50)  NOT NULL,
            severity         VARCHAR(20)  NOT NULL,
            step             INTEGER      NOT NULL,
            target_role      VARCHAR(50)  NOT NULL,
            delay_minutes    INTEGER      NOT NULL DEFAULT 30,
            is_active        BOOLEAN      DEFAULT TRUE,
            UNIQUE NULLS NOT DISTINCT (company_id, category, severity, step)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_escalation_policies_lookup "
               "ON escalation_policies (category, severity, is_active)")

    # ── 7. usage_snapshots ───────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS usage_snapshots (
            id               VARCHAR(36)   PRIMARY KEY,
            company_id       VARCHAR(36)   NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            snapshot_date    DATE          NOT NULL,
            active_users     INTEGER       DEFAULT 0,
            total_employees  INTEGER       DEFAULT 0,
            total_machines   INTEGER       DEFAULT 0,
            total_mills      INTEGER       DEFAULT 0,
            imports_count    INTEGER       DEFAULT 0,
            exports_count    INTEGER       DEFAULT 0,
            created_at       TIMESTAMPTZ   DEFAULT NOW(),
            UNIQUE (company_id, snapshot_date)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_usage_snapshots_company "
               "ON usage_snapshots (company_id, snapshot_date DESC)")

    # ── 8. Seed global escalation policies ───────────────────────────────
    _seed_escalation_policies()


def _seed_escalation_policies() -> None:
    """Insert default global escalation policies (company_id IS NULL = applies to all)."""
    from uuid import uuid4

    policies = [
        # MACHINE — CRITICAL
        ("MACHINE", "CRITICAL", 1, "MACHINE_OPERATOR", 0),
        ("MACHINE", "CRITICAL", 2, "SUPERVISOR",       15),
        ("MACHINE", "CRITICAL", 3, "PRODUCTION_MANAGER", 30),
        ("MACHINE", "CRITICAL", 4, "GENERAL_MANAGER",  60),
        ("MACHINE", "CRITICAL", 5, "MILL_OWNER",       120),
        # MACHINE — EMERGENCY
        ("MACHINE", "EMERGENCY", 1, "SUPERVISOR",           0),
        ("MACHINE", "EMERGENCY", 2, "PRODUCTION_MANAGER",  10),
        ("MACHINE", "EMERGENCY", 3, "MILL_OWNER",          20),
        # SECURITY — CRITICAL
        ("SECURITY", "CRITICAL", 1, "GENERAL_MANAGER", 0),
        ("SECURITY", "CRITICAL", 2, "MILL_OWNER",      15),
        # SECURITY — EMERGENCY
        ("SECURITY", "EMERGENCY", 1, "MILL_OWNER",   0),
        ("SECURITY", "EMERGENCY", 2, "SUPER_ADMIN", 10),
        # BILLING — WARNING
        ("BILLING", "WARNING",  1, "MILL_OWNER", 0),
        ("BILLING", "CRITICAL", 1, "MILL_OWNER", 0),
        # HR — WARNING
        ("HR", "WARNING", 1, "HR_MANAGER",      0),
        ("HR", "WARNING", 2, "GENERAL_MANAGER", 60),
        # INVENTORY — WARNING/CRITICAL
        ("INVENTORY", "WARNING",  1, "STORE_MANAGER",   0),
        ("INVENTORY", "CRITICAL", 1, "STORE_MANAGER",   0),
        ("INVENTORY", "CRITICAL", 2, "GENERAL_MANAGER", 30),
    ]

    for category, severity, step, target_role, delay in policies:
        op.execute(f"""
            INSERT INTO escalation_policies
                (id, company_id, category, severity, step, target_role, delay_minutes)
            VALUES
                ('{uuid4()}', NULL, '{category}', '{severity}', {step}, '{target_role}', {delay})
            ON CONFLICT (company_id, category, severity, step)
                WHERE company_id IS NULL
            DO NOTHING
        """)


# ---------------------------------------------------------------------------
# Downgrade
# ---------------------------------------------------------------------------

def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS usage_snapshots CASCADE")
    op.execute("DROP TABLE IF EXISTS escalation_policies CASCADE")
    op.execute("DROP TABLE IF EXISTS alert_acknowledgements CASCADE")
    op.execute("DROP TABLE IF EXISTS alert_events CASCADE")
    op.execute("DROP TABLE IF EXISTS alert_rules CASCADE")
    op.execute("DROP TABLE IF EXISTS notifications CASCADE")

    # Drop added indexes
    for idx in [
        "ix_audit_logs_category", "ix_audit_logs_severity",
        "ix_audit_logs_company_id", "ix_audit_logs_mill_id", "ix_audit_logs_module",
    ]:
        op.execute(f"DROP INDEX IF EXISTS {idx}")

    # Drop added columns (reverse order)
    for col in ["deleted_by", "deleted_at", "archived_at", "metadata_json",
                "module", "mill_id", "company_id", "company_name",
                "mill_name", "entity_name", "severity", "category"]:
        op.execute(f"ALTER TABLE audit_logs DROP COLUMN IF EXISTS {col}")

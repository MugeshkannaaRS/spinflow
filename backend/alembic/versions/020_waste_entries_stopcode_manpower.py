"""Waste entries, DATALOG stop codes, RF manpower, mixing fibre rows

Revision ID: 020
Revises: 019
Create Date: 2026-06-10 01:00:00.000000
"""
from typing import Sequence, Union
from alembic import op

revision: str = "020"
down_revision: Union[str, None] = "019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. downtime_logs — add DATALOG numeric code + time range            #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE downtime_logs
            ADD COLUMN IF NOT EXISTS datalog_code  INTEGER,
            ADD COLUMN IF NOT EXISTS stop_from     TIME,
            ADD COLUMN IF NOT EXISTS stop_to       TIME
    """)

    # ------------------------------------------------------------------ #
    # 2. production_entries — add ratio + efficiency                      #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE production_entries
            ADD COLUMN IF NOT EXISTS ratio    VARCHAR(50),
            ADD COLUMN IF NOT EXISTS effi_pct NUMERIC(6,3)
    """)

    # ------------------------------------------------------------------ #
    # 3. datalog_stop_codes — master lookup (seeded separately)           #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS datalog_stop_codes (
            code         INTEGER PRIMARY KEY,
            name         VARCHAR(100) NOT NULL,
            departments  JSONB,
            category     VARCHAR(30),
            is_active    BOOLEAN DEFAULT TRUE
        )
    """)

    # ------------------------------------------------------------------ #
    # 4. waste_entries — separate form from production_entries            #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS waste_entries (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            date            VARCHAR(10) NOT NULL,
            shift           VARCHAR(1)  NOT NULL,
            department      VARCHAR(50) NOT NULL,
            machine_code    VARCHAR(50) NOT NULL,
            lot_no          VARCHAR(50),
            ratio           VARCHAR(50),
            target_kg       NUMERIC(10,3),
            waste_kg        NUMERIC(10,3) NOT NULL,
            remarks         TEXT,
            operator_id     VARCHAR(36),
            operator_name   VARCHAR(200),
            entered_by      VARCHAR(200),
            status          VARCHAR(20) DEFAULT 'pending',
            approved_by     VARCHAR(200),
            approved_at     TIMESTAMP WITH TIME ZONE,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_waste_entries_mill_date ON waste_entries(mill_id, date)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_waste_entries_dept ON waste_entries(department)")

    # ------------------------------------------------------------------ #
    # 5. rf_manpower_plan — Ring Frame common category (machine range)    #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS rf_manpower_plan (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            date            VARCHAR(10) NOT NULL,
            shift           VARCHAR(1)  NOT NULL,
            category        VARCHAR(50) NOT NULL,
            mc_id_from      VARCHAR(50),
            mc_id_to        VARCHAR(50),
            total_machines  INTEGER DEFAULT 0,
            headcount       INTEGER DEFAULT 0,
            supervisor      VARCHAR(200),
            remarks         TEXT,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(mill_id, date, shift, category, mc_id_from)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_rf_manpower_mill_date ON rf_manpower_plan(mill_id, date)")

    # ------------------------------------------------------------------ #
    # 6. mixing_change_fibre_rows — per-fibre lines on change slip        #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS mixing_change_fibre_rows (
            id              VARCHAR(36) PRIMARY KEY,
            change_log_id   VARCHAR(36) NOT NULL REFERENCES mixing_change_log(id) ON DELETE CASCADE,
            fibre_type      VARCHAR(50) NOT NULL,
            present_lot     VARCHAR(100),
            proposed_lot    VARCHAR(100),
            remarks         TEXT,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mcfr_change_log_id ON mixing_change_fibre_rows(change_log_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS mixing_change_fibre_rows CASCADE")
    op.execute("DROP TABLE IF EXISTS rf_manpower_plan CASCADE")
    op.execute("DROP TABLE IF EXISTS waste_entries CASCADE")
    op.execute("DROP TABLE IF EXISTS datalog_stop_codes CASCADE")

    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS effi_pct")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS ratio")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS stop_to")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS stop_from")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS datalog_code")

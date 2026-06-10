"""Production module v2: meter readings, mixing, JCP, waste, utility breakdown

Revision ID: 019
Revises: 018
Create Date: 2026-06-10 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "019"
down_revision: Union[str, None] = "018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. machines — add line/section hierarchy fields                      #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE machines
            ADD COLUMN IF NOT EXISTS line_code       VARCHAR(10),
            ADD COLUMN IF NOT EXISTS machine_number  VARCHAR(20),
            ADD COLUMN IF NOT EXISTS section         VARCHAR(50),
            ADD COLUMN IF NOT EXISTS spindle_count   INTEGER
    """)

    # ------------------------------------------------------------------ #
    # 2. production_entries — meter readings, lot linkage, fiber blend     #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE production_entries
            ADD COLUMN IF NOT EXISTS lot_id                 VARCHAR(36),
            ADD COLUMN IF NOT EXISTS lot_no                 VARCHAR(50),
            ADD COLUMN IF NOT EXISTS hour_block             VARCHAR(10),
            ADD COLUMN IF NOT EXISTS opening_meter          NUMERIC(12,1),
            ADD COLUMN IF NOT EXISTS closing_meter          NUMERIC(12,1),
            ADD COLUMN IF NOT EXISTS spindle_meters         NUMERIC(12,1),
            ADD COLUMN IF NOT EXISTS opening_bobbin_count   INTEGER,
            ADD COLUMN IF NOT EXISTS closing_bobbin_count   INTEGER,
            ADD COLUMN IF NOT EXISTS production_kg_computed NUMERIC(10,3),
            ADD COLUMN IF NOT EXISTS production_kg_actual   NUMERIC(10,3),
            ADD COLUMN IF NOT EXISTS variance_kg            NUMERIC(10,3),
            ADD COLUMN IF NOT EXISTS fiber_composition      JSONB
    """)

    # ------------------------------------------------------------------ #
    # 3. downtime_logs — stop_type taxonomy, utility flag                  #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE downtime_logs
            ADD COLUMN IF NOT EXISTS stop_type            VARCHAR(50),
            ADD COLUMN IF NOT EXISTS production_loss_kg   NUMERIC(10,3) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS is_utility_breakdown BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS utility_ref_id       VARCHAR(36),
            ADD COLUMN IF NOT EXISTS mill_id              VARCHAR(36)
    """)

    # ------------------------------------------------------------------ #
    # 4. yarn_counts — fiber composition + colour code                     #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE yarn_counts
            ADD COLUMN IF NOT EXISTS fiber_composition JSONB,
            ADD COLUMN IF NOT EXISTS colour_code       VARCHAR(20),
            ADD COLUMN IF NOT EXISTS blend_ratio       VARCHAR(50)
    """)

    # ------------------------------------------------------------------ #
    # 5. mixing_recipes                                                    #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS mixing_recipes (
            id                  VARCHAR(36) PRIMARY KEY,
            mill_id             VARCHAR(36) NOT NULL REFERENCES mills(id),
            recipe_code         VARCHAR(50) NOT NULL,
            recipe_name         VARCHAR(200),
            yarn_count_id       VARCHAR(36) REFERENCES yarn_counts(id),
            lot_id              VARCHAR(36),
            fiber_composition   JSONB NOT NULL,
            is_active           BOOLEAN DEFAULT TRUE,
            approved_by         VARCHAR(200),
            approved_at         TIMESTAMP WITH TIME ZONE,
            remarks             TEXT,
            created_by          VARCHAR(200),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(mill_id, recipe_code)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mixing_recipes_mill_id ON mixing_recipes(mill_id)")

    # ------------------------------------------------------------------ #
    # 6. mixing_layers — per-fibre rows inside a recipe                   #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS mixing_layers (
            id              VARCHAR(36) PRIMARY KEY,
            recipe_id       VARCHAR(36) NOT NULL REFERENCES mixing_recipes(id) ON DELETE CASCADE,
            layer_no        INTEGER NOT NULL,
            fiber_type      VARCHAR(50) NOT NULL,
            percentage      NUMERIC(5,2) NOT NULL,
            kg_per_layer    NUMERIC(10,3),
            bale_count      INTEGER,
            remarks         VARCHAR(500),
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mixing_layers_recipe_id ON mixing_layers(recipe_id)")

    # ------------------------------------------------------------------ #
    # 7. mixing_change_log — Mixing Change Intimation Slip                #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS mixing_change_log (
            id                  VARCHAR(36) PRIMARY KEY,
            mill_id             VARCHAR(36) NOT NULL REFERENCES mills(id),
            change_date         VARCHAR(10) NOT NULL,
            shift               VARCHAR(1),
            intimation_slip_no  VARCHAR(50),
            old_recipe_id       VARCHAR(36) REFERENCES mixing_recipes(id),
            new_recipe_id       VARCHAR(36) REFERENCES mixing_recipes(id),
            reason              TEXT,
            approved_by         VARCHAR(200),
            approved_at         TIMESTAMP WITH TIME ZONE,
            status              VARCHAR(20) DEFAULT 'pending',
            created_by          VARCHAR(200),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_mixing_change_log_mill_date ON mixing_change_log(mill_id, change_date)")

    # ------------------------------------------------------------------ #
    # 8. laydown_records — physical laydown in Blow Room                  #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS laydown_records (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            date            VARCHAR(10) NOT NULL,
            shift           VARCHAR(1),
            machine_code    VARCHAR(50),
            recipe_id       VARCHAR(36) REFERENCES mixing_recipes(id),
            bale_count      INTEGER DEFAULT 0,
            total_kg        NUMERIC(10,3) DEFAULT 0,
            operator        VARCHAR(200),
            supervisor      VARCHAR(200),
            remarks         TEXT,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_laydown_records_mill_date ON laydown_records(mill_id, date)")

    # ------------------------------------------------------------------ #
    # 9. bale_consumption_log                                              #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS bale_consumption_log (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            date            VARCHAR(10) NOT NULL,
            shift           VARCHAR(1),
            lot_id          VARCHAR(36),
            bale_ref        VARCHAR(50),
            fiber_type      VARCHAR(50),
            weight_kg       NUMERIC(10,3) NOT NULL,
            department      VARCHAR(100),
            machine_code    VARCHAR(50),
            laydown_id      VARCHAR(36) REFERENCES laydown_records(id),
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_bale_consumption_mill_date ON bale_consumption_log(mill_id, date)")

    # ------------------------------------------------------------------ #
    # 10. jcp_clearances — Job Completion Permission (Quality + Commercial)#
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS jcp_clearances (
            id                  VARCHAR(36) PRIMARY KEY,
            mill_id             VARCHAR(36) NOT NULL REFERENCES mills(id),
            lot_id              VARCHAR(36) NOT NULL,
            lot_no              VARCHAR(50),
            clearance_type      VARCHAR(20) NOT NULL,
            status              VARCHAR(20) DEFAULT 'pending',
            approved_by         VARCHAR(200),
            approved_at         TIMESTAMP WITH TIME ZONE,
            remarks             TEXT,
            quality_ok          BOOLEAN DEFAULT FALSE,
            commercial_ok       BOOLEAN DEFAULT FALSE,
            created_by          VARCHAR(200),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_jcp_clearances_lot_id ON jcp_clearances(lot_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_jcp_clearances_mill_id ON jcp_clearances(mill_id)")

    # ------------------------------------------------------------------ #
    # 11. utility_breakdowns — compressor / power failure (one log → all) #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS utility_breakdowns (
            id                      VARCHAR(36) PRIMARY KEY,
            mill_id                 VARCHAR(36) NOT NULL REFERENCES mills(id),
            utility_type            VARCHAR(50) NOT NULL,
            started_at              TIMESTAMP WITH TIME ZONE NOT NULL,
            ended_at                TIMESTAMP WITH TIME ZONE,
            duration_min            INTEGER DEFAULT 0,
            affected_departments    JSONB,
            total_loss_kg           NUMERIC(10,3) DEFAULT 0,
            reported_by             VARCHAR(200),
            resolved_by             VARCHAR(200),
            remarks                 TEXT,
            created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_utility_breakdowns_mill_id ON utility_breakdowns(mill_id)")

    # ------------------------------------------------------------------ #
    # 12. waste_stock — 8 waste category bale ledger                      #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS waste_stock (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            waste_type      VARCHAR(50) NOT NULL,
            bale_ref        VARCHAR(50),
            weight_kg       NUMERIC(10,3) NOT NULL,
            date_collected  VARCHAR(10) NOT NULL,
            department      VARCHAR(100),
            machine_code    VARCHAR(50),
            status          VARCHAR(20) DEFAULT 'in_stock',
            sold_at         TIMESTAMP WITH TIME ZONE,
            sold_to         VARCHAR(200),
            sale_rate       NUMERIC(10,2),
            sale_amount     NUMERIC(12,2),
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_waste_stock_mill_id ON waste_stock(mill_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_waste_stock_waste_type ON waste_stock(waste_type)")

    # ------------------------------------------------------------------ #
    # 13. waste_transfers                                                  #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS waste_transfers (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            transfer_date   VARCHAR(10) NOT NULL,
            waste_type      VARCHAR(50) NOT NULL,
            from_department VARCHAR(100),
            to_location     VARCHAR(200),
            bale_count      INTEGER DEFAULT 0,
            weight_kg       NUMERIC(10,3) NOT NULL,
            transferred_by  VARCHAR(200),
            remarks         TEXT,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_waste_transfers_mill_date ON waste_transfers(mill_id, transfer_date)")

    # ------------------------------------------------------------------ #
    # 14. splice_quality_log — Autocone splice KPI per shift/machine      #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS splice_quality_log (
            id                  VARCHAR(36) PRIMARY KEY,
            mill_id             VARCHAR(36) NOT NULL REFERENCES mills(id),
            date                VARCHAR(10) NOT NULL,
            shift               VARCHAR(1),
            machine_code        VARCHAR(50),
            lot_id              VARCHAR(36),
            lot_no              VARCHAR(50),
            total_splices       INTEGER DEFAULT 0,
            rejected_splices    INTEGER DEFAULT 0,
            rejection_pct       NUMERIC(6,3),
            operator            VARCHAR(200),
            created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(mill_id, date, shift, machine_code)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_splice_quality_log_mill_date ON splice_quality_log(mill_id, date)")

    # ------------------------------------------------------------------ #
    # 15. shift_manpower_plan                                              #
    # ------------------------------------------------------------------ #
    op.execute("""
        CREATE TABLE IF NOT EXISTS shift_manpower_plan (
            id              VARCHAR(36) PRIMARY KEY,
            mill_id         VARCHAR(36) NOT NULL REFERENCES mills(id),
            date            VARCHAR(10) NOT NULL,
            shift           VARCHAR(1) NOT NULL,
            department      VARCHAR(100) NOT NULL,
            planned_count   INTEGER DEFAULT 0,
            actual_count    INTEGER DEFAULT 0,
            supervisor      VARCHAR(200),
            remarks         TEXT,
            created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(mill_id, date, shift, department)
        )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_shift_manpower_mill_date ON shift_manpower_plan(mill_id, date)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS shift_manpower_plan CASCADE")
    op.execute("DROP TABLE IF EXISTS splice_quality_log CASCADE")
    op.execute("DROP TABLE IF EXISTS waste_transfers CASCADE")
    op.execute("DROP TABLE IF EXISTS waste_stock CASCADE")
    op.execute("DROP TABLE IF EXISTS utility_breakdowns CASCADE")
    op.execute("DROP TABLE IF EXISTS jcp_clearances CASCADE")
    op.execute("DROP TABLE IF EXISTS bale_consumption_log CASCADE")
    op.execute("DROP TABLE IF EXISTS laydown_records CASCADE")
    op.execute("DROP TABLE IF EXISTS mixing_change_log CASCADE")
    op.execute("DROP TABLE IF EXISTS mixing_layers CASCADE")
    op.execute("DROP TABLE IF EXISTS mixing_recipes CASCADE")

    op.execute("ALTER TABLE yarn_counts DROP COLUMN IF EXISTS blend_ratio")
    op.execute("ALTER TABLE yarn_counts DROP COLUMN IF EXISTS colour_code")
    op.execute("ALTER TABLE yarn_counts DROP COLUMN IF EXISTS fiber_composition")

    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS mill_id")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS utility_ref_id")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS is_utility_breakdown")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS production_loss_kg")
    op.execute("ALTER TABLE downtime_logs DROP COLUMN IF EXISTS stop_type")

    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS fiber_composition")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS variance_kg")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS production_kg_actual")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS production_kg_computed")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS closing_bobbin_count")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS opening_bobbin_count")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS spindle_meters")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS closing_meter")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS opening_meter")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS hour_block")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS lot_no")
    op.execute("ALTER TABLE production_entries DROP COLUMN IF EXISTS lot_id")

    op.execute("ALTER TABLE machines DROP COLUMN IF EXISTS spindle_count")
    op.execute("ALTER TABLE machines DROP COLUMN IF EXISTS section")
    op.execute("ALTER TABLE machines DROP COLUMN IF EXISTS machine_number")
    op.execute("ALTER TABLE machines DROP COLUMN IF EXISTS line_code")

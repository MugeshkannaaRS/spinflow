"""Fix machines.code unique constraint: global → (mill_id, code)

Problem:  migration 001 created UNIQUE INDEX ix_machines_code ON machines (code).
          This is a global uniqueness constraint. When a second mill or company is
          onboarded, two mills cannot share machine codes (e.g., both have machine
          "RF-01"). The constraint must be scoped to (mill_id, code).

Impact:   All 9 tables that reference machines via the string column machine_code
          (production_entries, downtime_logs, maintenance_logs, etc.) implicitly
          depend on machine codes being globally unique. After this migration those
          codes are only unique per mill — which is the correct semantic. String FK
          resolution (machine_code → machines.code) will be handled in a later
          migration that adds machine_id UUID FK columns.

Safety:   This migration embeds a pre-check. If duplicate codes exist across mills,
          or any machine has a NULL mill_id, the upgrade() raises an exception and
          the transaction is rolled back with NO schema changes applied.

Revision ID: 023
Revises: 022
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op


revision: str = "023"
down_revision: Union[str, None] = "022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # STEP 0 — Safety assertion (aborts entire transaction on failure)    #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$
        DECLARE
            dup_count  INT;
            null_count INT;
        BEGIN
            -- Check 1: duplicate codes within the same mill
            SELECT COUNT(*) INTO dup_count
            FROM (
                SELECT code, mill_id
                FROM machines
                GROUP BY code, mill_id
                HAVING COUNT(*) > 1
            ) t;

            IF dup_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 023: % machine rows have duplicate (mill_id, code) pairs. '
                    'Deduplicate machines before re-running.',
                    dup_count;
            END IF;

            -- Check 2: machines with NULL mill_id cannot participate in a NOT-NULL composite unique
            SELECT COUNT(*) INTO null_count
            FROM machines
            WHERE mill_id IS NULL;

            IF null_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 023: % machines have NULL mill_id. '
                    'Assign every machine to a mill before re-running.',
                    null_count;
            END IF;
        END;
        $$
    """)

    # ------------------------------------------------------------------ #
    # STEP 1 — Drop FK constraints that depend on ix_machines_code        #
    #                                                                      #
    # production_entries.machine_code and downtime_logs.machine_code are  #
    # string FKs referencing machines.code. PostgreSQL enforced them via   #
    # the unique index. We drop them here; the string relationship remains  #
    # in the data. A future migration will replace these with UUID FKs.    #
    # ------------------------------------------------------------------ #
    op.execute("""
        ALTER TABLE production_entries
            DROP CONSTRAINT IF EXISTS production_entries_machine_code_fkey
    """)
    op.execute("""
        ALTER TABLE downtime_logs
            DROP CONSTRAINT IF EXISTS downtime_logs_machine_code_fkey
    """)

    # ------------------------------------------------------------------ #
    # STEP 2 — Drop the old global unique index                           #
    # ------------------------------------------------------------------ #
    op.execute("DROP INDEX IF EXISTS ix_machines_code")

    # ------------------------------------------------------------------ #
    # STEP 2 — Add composite unique constraint (mill_id, code)            #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_machines_mill_code'
                  AND conrelid = 'machines'::regclass
            ) THEN
                ALTER TABLE machines
                    ADD CONSTRAINT uq_machines_mill_code UNIQUE (mill_id, code);
            END IF;
        END;
        $$
    """)

    # ------------------------------------------------------------------ #
    # STEP 3 — Re-create a plain (non-unique) index on code alone         #
    #          so that lookups by code without mill_id remain fast         #
    # ------------------------------------------------------------------ #
    op.execute("CREATE INDEX IF NOT EXISTS ix_machines_code ON machines (code)")


def downgrade() -> None:
    # Remove the composite unique constraint
    op.execute("ALTER TABLE machines DROP CONSTRAINT IF EXISTS uq_machines_mill_code")

    # Remove the plain index created in upgrade
    op.execute("DROP INDEX IF EXISTS ix_machines_code")

    # Restore the original global unique index from migration 001
    # This will FAIL if duplicate codes have been inserted across mills
    # while the composite constraint was active — which is intentional.
    op.execute("CREATE UNIQUE INDEX ix_machines_code ON machines (code)")

    # Restore the string FK constraints (they depend on the unique index above)
    op.execute("""
        ALTER TABLE production_entries
            ADD CONSTRAINT production_entries_machine_code_fkey
            FOREIGN KEY (machine_code) REFERENCES machines (code)
    """)
    op.execute("""
        ALTER TABLE downtime_logs
            ADD CONSTRAINT downtime_logs_machine_code_fkey
            FOREIGN KEY (machine_code) REFERENCES machines (code)
    """)

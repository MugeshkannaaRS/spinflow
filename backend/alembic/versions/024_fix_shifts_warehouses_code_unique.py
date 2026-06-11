"""Fix shifts.code and warehouses.code: global UNIQUE → (mill_id, code) composite

Problem:  migration 001 created both tables with UNIQUE (code) inline in the DDL.
          The Python Shift model declares UniqueConstraint("mill_id", "code") but
          no migration was ever created to enforce it — the DB still has the global
          constraint.  Same issue in warehouses.

          A second mill cannot reuse shift codes (A/B/C/G) or warehouse codes
          (WH-01, FG, etc.) that already exist in another mill.

Safety:   Embedded pre-check raises an exception if duplicates across mills are
          found. The transaction is rolled back with no schema changes.

Revision ID: 024
Revises: 023
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op


revision: str = "024"
down_revision: Union[str, None] = "023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ================================================================== #
    #  SHIFTS                                                              #
    # ================================================================== #

    # STEP 0 — Safety assertion for shifts
    op.execute("""
        DO $$
        DECLARE
            dup_count  INT;
            null_count INT;
        BEGIN
            -- Duplicate (mill_id, code) pairs
            SELECT COUNT(*) INTO dup_count
            FROM (
                SELECT code, mill_id
                FROM shifts
                WHERE mill_id IS NOT NULL
                GROUP BY code, mill_id
                HAVING COUNT(*) > 1
            ) t;

            IF dup_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 024: % shift rows have duplicate (mill_id, code). '
                    'Deduplicate shifts before re-running.',
                    dup_count;
            END IF;

            -- NULL mill_id
            SELECT COUNT(*) INTO null_count
            FROM shifts
            WHERE mill_id IS NULL;

            IF null_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 024: % shifts have NULL mill_id. '
                    'Assign every shift to a mill before re-running.',
                    null_count;
            END IF;
        END;
        $$
    """)

    # STEP 1 — Drop old global unique constraint on shifts.code
    # migration 001 used inline UNIQUE (code), which PostgreSQL names <table>_<col>_key
    op.execute("ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_code_key")
    # Also drop by index name in case it was created as an index
    op.execute("DROP INDEX IF EXISTS ix_shifts_code")

    # STEP 2 — Add composite unique (mill_id, code)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_shifts_mill_code'
                  AND conrelid = 'shifts'::regclass
            ) THEN
                ALTER TABLE shifts
                    ADD CONSTRAINT uq_shifts_mill_code UNIQUE (mill_id, code);
            END IF;
        END;
        $$
    """)

    # STEP 3 — Non-unique index on shifts.code for fast lookups
    op.execute("CREATE INDEX IF NOT EXISTS ix_shifts_code ON shifts (code)")

    # ================================================================== #
    #  WAREHOUSES                                                          #
    # ================================================================== #

    # STEP 0 — Add mill_id column if it doesn't exist.
    #
    # The Python model always declared this column but no earlier migration
    # ever applied it.  We add it here as nullable so existing warehouse rows
    # are not broken.  mill_id values will be assigned via admin or a
    # subsequent data migration (Wave 3B).  Until then the column is NULL
    # for legacy rows — PostgreSQL treats NULLs as distinct in UNIQUE
    # constraints, so those rows won't violate uq_warehouses_mill_code.
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'warehouses' AND column_name = 'mill_id'
            ) THEN
                ALTER TABLE warehouses
                    ADD COLUMN mill_id VARCHAR(36)
                    REFERENCES mills (id);
                CREATE INDEX ix_warehouses_mill_id ON warehouses (mill_id);
            END IF;
        END;
        $$
    """)

    # STEP 1 — Safety assertion: only check for duplicate (mill_id, code) pairs
    # among rows that already have a mill_id assigned.  We intentionally skip
    # the NULL mill_id check here because the column was just added and all
    # existing rows are NULL — that is expected and safe (see note above).
    op.execute("""
        DO $$
        DECLARE dup_count INT;
        BEGIN
            SELECT COUNT(*) INTO dup_count
            FROM (
                SELECT code, mill_id
                FROM warehouses
                WHERE mill_id IS NOT NULL
                GROUP BY code, mill_id
                HAVING COUNT(*) > 1
            ) t;
            IF dup_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 024: % warehouse rows have duplicate (mill_id, code). '
                    'Deduplicate warehouses before re-running.',
                    dup_count;
            END IF;
        END;
        $$
    """)

    # STEP 2 — Drop old global unique constraint on warehouses.code
    op.execute("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS warehouses_code_key")
    op.execute("DROP INDEX IF EXISTS ix_warehouses_code")

    # STEP 3 — Add composite unique (mill_id, code)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_warehouses_mill_code'
                  AND conrelid = 'warehouses'::regclass
            ) THEN
                ALTER TABLE warehouses
                    ADD CONSTRAINT uq_warehouses_mill_code UNIQUE (mill_id, code);
            END IF;
        END;
        $$
    """)

    # STEP 4 — Non-unique index on warehouses.code for fast lookups
    op.execute("CREATE INDEX IF NOT EXISTS ix_warehouses_code ON warehouses (code)")


def downgrade() -> None:
    # --- warehouses ---
    op.execute("ALTER TABLE warehouses DROP CONSTRAINT IF EXISTS uq_warehouses_mill_code")
    op.execute("DROP INDEX IF EXISTS ix_warehouses_code")
    op.execute("CREATE UNIQUE INDEX ix_warehouses_code ON warehouses (code)")

    # --- shifts ---
    op.execute("ALTER TABLE shifts DROP CONSTRAINT IF EXISTS uq_shifts_mill_code")
    op.execute("DROP INDEX IF EXISTS ix_shifts_code")
    op.execute("CREATE UNIQUE INDEX ix_shifts_code ON shifts (code)")

"""Fix mills.code unique constraint: global → (company_id, code)

Problem:  migration 001 created UNIQUE INDEX ix_mills_code ON mills (code).
          This is a global constraint. Two different companies cannot have a mill
          with the same code (e.g., "MILL-01"), blocking multi-company onboarding.
          The correct scope is per-company: (company_id, code) must be unique.

Note:     mills.company_id is NOT NULL (enforced by a FOREIGN KEY to companies).
          No backfill required.

Safety:   Embedded pre-check aborts if any two mills within the same company share
          the same code. Mills with the same code across different companies are
          expected and allowed — that is exactly what this migration enables.

Revision ID: 026
Revises: 025
Create Date: 2026-06-11
"""
from typing import Sequence, Union
from alembic import op


revision: str = "026"
down_revision: Union[str, None] = "025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # STEP 0 — Safety assertion                                            #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$
        DECLARE dup_count INT;
        BEGIN
            -- Two mills in the SAME company share the same code — that would
            -- violate the new composite constraint and is a data error.
            SELECT COUNT(*) INTO dup_count
            FROM (
                SELECT code, company_id
                FROM mills
                GROUP BY code, company_id
                HAVING COUNT(*) > 1
            ) t;

            IF dup_count > 0 THEN
                RAISE EXCEPTION
                    'ABORT migration 026: % (company_id, code) pairs are duplicated in mills. '
                    'Fix mill codes within the same company before re-running.',
                    dup_count;
            END IF;
        END;
        $$
    """)

    # ------------------------------------------------------------------ #
    # STEP 1 — Drop old global unique index                                #
    # ------------------------------------------------------------------ #
    op.execute("DROP INDEX IF EXISTS ix_mills_code")

    # ------------------------------------------------------------------ #
    # STEP 2 — Add composite unique (company_id, code)                    #
    # ------------------------------------------------------------------ #
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'uq_mills_company_code'
                  AND conrelid = 'mills'::regclass
            ) THEN
                ALTER TABLE mills
                    ADD CONSTRAINT uq_mills_company_code UNIQUE (company_id, code);
            END IF;
        END;
        $$
    """)

    # ------------------------------------------------------------------ #
    # STEP 3 — Non-unique index on mills.code for fast lookups            #
    # ------------------------------------------------------------------ #
    op.execute("CREATE INDEX IF NOT EXISTS ix_mills_code ON mills (code)")


def downgrade() -> None:
    op.execute("ALTER TABLE mills DROP CONSTRAINT IF EXISTS uq_mills_company_code")
    op.execute("DROP INDEX IF EXISTS ix_mills_code")
    # Restore original global unique — will fail if two companies now share a code
    op.execute("CREATE UNIQUE INDEX ix_mills_code ON mills (code)")

"""Add flat r1-r5 reading columns to quality forms that need them

Adds individual sample weight columns (r1..r5) to:
  - qm_simplex_hank_test       (5 readings per test)
  - qm_carding_wrapping        (5 readings per machine)
  - qm_sliver_wrapping         (5 readings per side)

Also adds r1..r10 + s1..s10 (weight + count) to:
  - qm_rf_csp_report           (10 strength+weight samples)

Existing readings_json columns are kept for backward compat.

Revision ID: 044
Revises: 043
Create Date: 2026-06-21
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "044"
down_revision: Union[str, None] = "043"
branch_labels = None
depends_on = None


def _add_col(table: str, col: str, col_type: str) -> None:
    op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}")


def upgrade() -> None:
    # ── qm_simplex_hank_test: 5 weight readings (grams) ───────────────────
    for i in range(1, 6):
        _add_col("qm_simplex_hank_test", f"r{i}", "FLOAT")

    # ── qm_carding_wrapping: 5 weight readings ─────────────────────────────
    for i in range(1, 6):
        _add_col("qm_carding_wrapping", f"r{i}", "FLOAT")

    # ── qm_sliver_wrapping: 5 weight readings ──────────────────────────────
    for i in range(1, 6):
        _add_col("qm_sliver_wrapping", f"r{i}", "FLOAT")

    # ── qm_rf_csp_report: 10 (strength, weight, count, csp) samples ────────
    # s = strength (gf), w = weight (g), ne = count Ne
    for i in range(1, 11):
        _add_col("qm_rf_csp_report", f"s{i}_strength", "FLOAT")
        _add_col("qm_rf_csp_report", f"s{i}_weight", "FLOAT")
        _add_col("qm_rf_csp_report", f"s{i}_count", "FLOAT")
        _add_col("qm_rf_csp_report", f"s{i}_csp", "FLOAT")

    # ── qm_a_pct_check: 10 hank readings (N+1/N/N-1 groups) ───────────────
    for i in range(1, 11):
        _add_col("qm_a_pct_check", f"r{i}", "FLOAT")

    # ── qm_drawing_cv_record: ensure cv_5cm..cv_50cm columns exist ─────────
    for col, ctype in [
        ("cv_5cm", "FLOAT"),
        ("cv_10cm", "FLOAT"),
        ("cv_25cm", "FLOAT"),
        ("cv_50cm", "FLOAT"),
    ]:
        _add_col("qm_drawing_cv_record", col, ctype)


def downgrade() -> None:
    pass  # intentionally no downgrade — safe to leave extra columns

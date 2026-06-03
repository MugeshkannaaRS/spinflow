"""sprint5_payroll — Payroll and Employee fields

Revision ID: 006
Revises: 005
Create Date: 2026-05-22
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ── Employee columns ───────────────────────────────────
    existing_employee_cols = [c["name"] for c in inspector.get_columns("employees")]
    if "mill_id" not in existing_employee_cols:
        op.add_column("employees", sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=True, index=True))
    if "daily_wage" not in existing_employee_cols:
        op.add_column("employees", sa.Column("daily_wage", sa.Float, server_default=sa.text("0.0"), nullable=False))
    if "pf_no" not in existing_employee_cols:
        op.add_column("employees", sa.Column("pf_no", sa.String(50), nullable=True))
    if "esic_no" not in existing_employee_cols:
        op.add_column("employees", sa.Column("esic_no", sa.String(50), nullable=True))
    if "bank_account" not in existing_employee_cols:
        op.add_column("employees", sa.Column("bank_account", sa.String(50), nullable=True))
    if "bank_ifsc" not in existing_employee_cols:
        op.add_column("employees", sa.Column("bank_ifsc", sa.String(20), nullable=True))
    if "pf_enrolled" not in existing_employee_cols:
        op.add_column("employees", sa.Column("pf_enrolled", sa.Boolean, server_default=sa.text("false"), nullable=False))
    if "esic_enrolled" not in existing_employee_cols:
        op.add_column("employees", sa.Column("esic_enrolled", sa.Boolean, server_default=sa.text("false"), nullable=False))

    # ── Payroll Months ──────────────────────────────────────
    if "payroll_months" not in existing_tables:
        op.create_table(
            "payroll_months",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("month", sa.Integer, nullable=False),
            sa.Column("year", sa.Integer, nullable=False),
            sa.Column("status", sa.String(20), server_default=sa.text("'draft'"), nullable=False),
            sa.Column("total_employees", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("total_gross", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("total_deductions", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("total_net", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("total_pf", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("total_esic", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("processed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("approved_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_unique_constraint("uq_payroll_month_mill_month_year", "payroll_months", ["mill_id", "month", "year"])
        op.create_index("ix_payroll_months_mill_year_month", "payroll_months", ["mill_id", "year", "month"])

    # ── Payslip Entries ─────────────────────────────────────
    if "payslip_entries" not in existing_tables:
        op.create_table(
            "payslip_entries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("payroll_month_id", sa.String(36), sa.ForeignKey("payroll_months.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("employee_id", sa.String(36), sa.ForeignKey("employees.id"), nullable=False, index=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False),
            sa.Column("month", sa.Integer, nullable=False),
            sa.Column("year", sa.Integer, nullable=False),
            sa.Column("present_days", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("absent_days", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("half_days", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("overtime_hours", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("daily_wage", sa.Float, nullable=False),
            sa.Column("basic_wage", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("overtime_amount", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("gross_wage", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("pf_employee", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("pf_employer", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("esic_employee", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("esic_employer", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("other_deductions", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("net_wage", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("payment_mode", sa.String(20), server_default=sa.text("'bank'"), nullable=False),
            sa.Column("payment_ref", sa.String(200), nullable=True),
            sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("status", sa.String(20), server_default=sa.text("'pending'"), nullable=False),
            sa.Column("remarks", sa.Text, nullable=True),
        )
        op.create_unique_constraint("uq_payslip_month_employee", "payslip_entries", ["payroll_month_id", "employee_id"])
        op.create_index("ix_payslip_entries_month_employee", "payslip_entries", ["payroll_month_id", "employee_id"])


def downgrade() -> None:
    op.drop_table("payslip_entries")
    op.drop_table("payroll_months")
    op.drop_column("employees", "esic_enrolled")
    op.drop_column("employees", "pf_enrolled")
    op.drop_column("employees", "bank_ifsc")
    op.drop_column("employees", "bank_account")
    op.drop_column("employees", "esic_no")
    op.drop_column("employees", "pf_no")
    op.drop_column("employees", "daily_wage")
    op.drop_column("employees", "mill_id")

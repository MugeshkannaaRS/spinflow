"""tenant safety and financial precision

Revision ID: 041
Revises: 040
Create Date: 2026-06-21

Changes:
- Add mill_id + company_id to dispatches, quality_tests, lab_reports, quality_approvals, cotton_bales
- Add FK constraints to users.company_id and users.mill_id
- Change Float → Numeric on money columns:
    cotton_purchases.rate_per_kg         → Numeric(12,4)
    payroll_months.total_gross/deductions/net/pf/esic → Numeric(14,2)
    payslip_entries.daily_wage/basic_wage/... → Numeric(10,2)
    customers.credit_limit               → Numeric(14,2)
    employees.salary/daily_wage          → Numeric(10,2)
"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = "041"
down_revision: Union[str, None] = "040"
branch_labels = None
depends_on = None


def _add_column_if_not_exists(table: str, column: str, col_def: str) -> None:
    op.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col_def}")

def _create_index_if_not_exists(index_name: str, table: str, columns: list[str]) -> None:
    cols = ", ".join(columns)
    op.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({cols})")


def upgrade() -> None:
    # ── dispatches: add tenant columns ────────────────────────────────────
    _add_column_if_not_exists("dispatches", "mill_id", "mill_id VARCHAR(36) REFERENCES mills(id)")
    _add_column_if_not_exists("dispatches", "company_id", "company_id VARCHAR(36) REFERENCES companies(id)")
    _create_index_if_not_exists("ix_dispatches_mill_id", "dispatches", ["mill_id"])
    _create_index_if_not_exists("ix_dispatches_company_id", "dispatches", ["company_id"])

    # ── quality_tests: add tenant columns ─────────────────────────────────
    _add_column_if_not_exists("quality_tests", "mill_id", "mill_id VARCHAR(36) REFERENCES mills(id)")
    _add_column_if_not_exists("quality_tests", "company_id", "company_id VARCHAR(36) REFERENCES companies(id)")
    _create_index_if_not_exists("ix_quality_tests_mill_id", "quality_tests", ["mill_id"])
    _create_index_if_not_exists("ix_quality_tests_company_id", "quality_tests", ["company_id"])

    # ── lab_reports: add tenant columns ───────────────────────────────────
    _add_column_if_not_exists("lab_reports", "mill_id", "mill_id VARCHAR(36) REFERENCES mills(id)")
    _add_column_if_not_exists("lab_reports", "company_id", "company_id VARCHAR(36) REFERENCES companies(id)")
    _create_index_if_not_exists("ix_lab_reports_mill_id", "lab_reports", ["mill_id"])
    _create_index_if_not_exists("ix_lab_reports_company_id", "lab_reports", ["company_id"])

    # ── quality_approvals: add tenant columns ──────────────────────────────
    _add_column_if_not_exists("quality_approvals", "mill_id", "mill_id VARCHAR(36) REFERENCES mills(id)")
    _add_column_if_not_exists("quality_approvals", "company_id", "company_id VARCHAR(36) REFERENCES companies(id)")
    _create_index_if_not_exists("ix_quality_approvals_mill_id", "quality_approvals", ["mill_id"])
    _create_index_if_not_exists("ix_quality_approvals_company_id", "quality_approvals", ["company_id"])

    # ── cotton_bales: add tenant columns ──────────────────────────────────
    _add_column_if_not_exists("cotton_bales", "mill_id", "mill_id VARCHAR(36) REFERENCES mills(id)")
    _add_column_if_not_exists("cotton_bales", "company_id", "company_id VARCHAR(36) REFERENCES companies(id)")
    _create_index_if_not_exists("ix_cotton_bales_mill_id", "cotton_bales", ["mill_id"])
    _create_index_if_not_exists("ix_cotton_bales_company_id", "cotton_bales", ["company_id"])

    # ── users: add FK constraints ──────────────────────────────────────────
    # Note: company_id and mill_id columns already exist — we only add FKs.
    # Supabase (Postgres) supports ADD CONSTRAINT on existing columns.
    with op.batch_alter_table("users") as batch_op:
        batch_op.create_foreign_key("fk_users_company_id", "companies", ["company_id"], ["id"])
        batch_op.create_foreign_key("fk_users_mill_id", "mills", ["mill_id"], ["id"])

    # ── cotton_purchases.rate_per_kg: Float → Numeric(12,4) ───────────────
    with op.batch_alter_table("cotton_purchases") as batch_op:
        batch_op.alter_column(
            "rate_per_kg",
            existing_type=sa.Float(),
            type_=sa.Numeric(12, 4),
            existing_nullable=False,
        )

    # ── payroll_months: Float → Numeric(14,2) ─────────────────────────────
    with op.batch_alter_table("payroll_months") as batch_op:
        for col in ("total_gross", "total_deductions", "total_net", "total_pf", "total_esic"):
            batch_op.alter_column(
                col,
                existing_type=sa.Float(),
                type_=sa.Numeric(14, 2),
                existing_nullable=True,
            )

    # ── payslip_entries: Float → Numeric(10,2) ────────────────────────────
    with op.batch_alter_table("payslip_entries") as batch_op:
        for col in (
            "daily_wage", "basic_wage", "overtime_amount", "gross_wage",
            "pf_employee", "pf_employer", "esic_employee", "esic_employer",
            "other_deductions", "net_wage",
        ):
            batch_op.alter_column(
                col,
                existing_type=sa.Float(),
                type_=sa.Numeric(10, 2),
                existing_nullable=True,
            )

    # ── customers.credit_limit: Float → Numeric(14,2) ─────────────────────
    with op.batch_alter_table("customers") as batch_op:
        batch_op.alter_column(
            "credit_limit",
            existing_type=sa.Float(),
            type_=sa.Numeric(14, 2),
            existing_nullable=True,
        )

    # ── employees.salary + daily_wage: Float → Numeric(10,2) ──────────────
    with op.batch_alter_table("employees") as batch_op:
        batch_op.alter_column(
            "salary",
            existing_type=sa.Float(),
            type_=sa.Numeric(10, 2),
            existing_nullable=True,
        )
        batch_op.alter_column(
            "daily_wage",
            existing_type=sa.Float(),
            type_=sa.Numeric(10, 2),
            existing_nullable=True,
        )

    # ── unique constraints ─────────────────────────────────────────────────
    with op.batch_alter_table("module_pricing") as batch_op:
        batch_op.create_unique_constraint("uq_module_pricing_plan_module", ["plan_id", "module_name"])

    with op.batch_alter_table("overage_pricing") as batch_op:
        batch_op.create_unique_constraint("uq_overage_pricing_company_resource", ["company_id", "resource_type"])

    with op.batch_alter_table("employee_custom_fields") as batch_op:
        batch_op.create_unique_constraint("uq_employee_custom_fields_company_name", ["company_id", "field_name"])

    with op.batch_alter_table("employee_custom_values") as batch_op:
        batch_op.create_unique_constraint("uq_employee_custom_values_employee_field", ["employee_id", "field_id"])

    with op.batch_alter_table("operator_groups") as batch_op:
        batch_op.create_unique_constraint("uq_operator_groups_mill_name", ["mill_id", "name"])

    with op.batch_alter_table("machine_groups") as batch_op:
        batch_op.create_unique_constraint("uq_machine_groups_mill_name", ["mill_id", "name"])


def downgrade() -> None:
    # ── employees ──────────────────────────────────────────────────────────
    with op.batch_alter_table("employees") as batch_op:
        batch_op.alter_column("salary", existing_type=sa.Numeric(10, 2), type_=sa.Float(), existing_nullable=True)
        batch_op.alter_column("daily_wage", existing_type=sa.Numeric(10, 2), type_=sa.Float(), existing_nullable=True)

    # ── customers ─────────────────────────────────────────────────────────
    with op.batch_alter_table("customers") as batch_op:
        batch_op.alter_column("credit_limit", existing_type=sa.Numeric(14, 2), type_=sa.Float(), existing_nullable=True)

    # ── payslip_entries ───────────────────────────────────────────────────
    with op.batch_alter_table("payslip_entries") as batch_op:
        for col in (
            "daily_wage", "basic_wage", "overtime_amount", "gross_wage",
            "pf_employee", "pf_employer", "esic_employee", "esic_employer",
            "other_deductions", "net_wage",
        ):
            batch_op.alter_column(col, existing_type=sa.Numeric(10, 2), type_=sa.Float(), existing_nullable=True)

    # ── payroll_months ────────────────────────────────────────────────────
    with op.batch_alter_table("payroll_months") as batch_op:
        for col in ("total_gross", "total_deductions", "total_net", "total_pf", "total_esic"):
            batch_op.alter_column(col, existing_type=sa.Numeric(14, 2), type_=sa.Float(), existing_nullable=True)

    # ── cotton_purchases ──────────────────────────────────────────────────
    with op.batch_alter_table("cotton_purchases") as batch_op:
        batch_op.alter_column("rate_per_kg", existing_type=sa.Numeric(12, 4), type_=sa.Float(), existing_nullable=False)

    # ── users FKs ─────────────────────────────────────────────────────────
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_constraint("fk_users_company_id", type_="foreignkey")
        batch_op.drop_constraint("fk_users_mill_id", type_="foreignkey")

    # ── cotton_bales ──────────────────────────────────────────────────────
    op.drop_index("ix_cotton_bales_mill_id", "cotton_bales")
    op.drop_index("ix_cotton_bales_company_id", "cotton_bales")
    op.drop_column("cotton_bales", "company_id")
    op.drop_column("cotton_bales", "mill_id")

    # ── quality_approvals ─────────────────────────────────────────────────
    op.drop_index("ix_quality_approvals_mill_id", "quality_approvals")
    op.drop_index("ix_quality_approvals_company_id", "quality_approvals")
    op.drop_column("quality_approvals", "company_id")
    op.drop_column("quality_approvals", "mill_id")

    # ── lab_reports ───────────────────────────────────────────────────────
    op.drop_index("ix_lab_reports_mill_id", "lab_reports")
    op.drop_index("ix_lab_reports_company_id", "lab_reports")
    op.drop_column("lab_reports", "company_id")
    op.drop_column("lab_reports", "mill_id")

    # ── quality_tests ─────────────────────────────────────────────────────
    op.drop_index("ix_quality_tests_mill_id", "quality_tests")
    op.drop_index("ix_quality_tests_company_id", "quality_tests")
    op.drop_column("quality_tests", "company_id")
    op.drop_column("quality_tests", "mill_id")

    # ── dispatches ────────────────────────────────────────────────────────
    op.drop_index("ix_dispatches_mill_id", "dispatches")
    op.drop_index("ix_dispatches_company_id", "dispatches")
    op.drop_column("dispatches", "company_id")
    op.drop_column("dispatches", "mill_id")

    # ── unique constraints ─────────────────────────────────────────────────
    with op.batch_alter_table("machine_groups") as batch_op:
        batch_op.drop_constraint("uq_machine_groups_mill_name", type_="unique")

    with op.batch_alter_table("operator_groups") as batch_op:
        batch_op.drop_constraint("uq_operator_groups_mill_name", type_="unique")

    with op.batch_alter_table("employee_custom_values") as batch_op:
        batch_op.drop_constraint("uq_employee_custom_values_employee_field", type_="unique")

    with op.batch_alter_table("employee_custom_fields") as batch_op:
        batch_op.drop_constraint("uq_employee_custom_fields_company_name", type_="unique")

    with op.batch_alter_table("overage_pricing") as batch_op:
        batch_op.drop_constraint("uq_overage_pricing_company_resource", type_="unique")

    with op.batch_alter_table("module_pricing") as batch_op:
        batch_op.drop_constraint("uq_module_pricing_plan_module", type_="unique")

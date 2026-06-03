"""Add HR employee columns and monthly_payroll table

Revision ID: 009
Revises: 008
Create Date: 2026-05-24
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    existing_employee_cols = [c["name"] for c in inspector.get_columns("employees")]
    if "sl_no" not in existing_employee_cols:
        op.add_column("employees", sa.Column("sl_no", sa.Integer(), nullable=True))
    if "employee_id" not in existing_employee_cols:
        op.add_column("employees", sa.Column("employee_id", sa.String(50), nullable=True))
    if "joining_date" not in existing_employee_cols:
        op.add_column("employees", sa.Column("joining_date", sa.Date(), nullable=True))
    if "gen" not in existing_employee_cols:
        op.add_column("employees", sa.Column("gen", sa.String(10), nullable=True))
    if "dob" not in existing_employee_cols:
        op.add_column("employees", sa.Column("dob", sa.Date(), nullable=True))
    if "age" not in existing_employee_cols:
        op.add_column("employees", sa.Column("age", sa.Integer(), nullable=True))
    if "gender" not in existing_employee_cols:
        op.add_column("employees", sa.Column("gender", sa.String(10), nullable=True))
    if "grade" not in existing_employee_cols:
        op.add_column("employees", sa.Column("grade", sa.String(20), nullable=True))
    if "designation" not in existing_employee_cols:
        op.add_column("employees", sa.Column("designation", sa.String(100), nullable=True))
    if "section" not in existing_employee_cols:
        op.add_column("employees", sa.Column("section", sa.String(100), nullable=True))
    if "department_name" not in existing_employee_cols:
        op.add_column("employees", sa.Column("department_name", sa.String(100), nullable=True))
    if "bank_account_no" not in existing_employee_cols:
        op.add_column("employees", sa.Column("bank_account_no", sa.String(50), nullable=True))
    if "basic" not in existing_employee_cols:
        op.add_column("employees", sa.Column("basic", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "house_rent" not in existing_employee_cols:
        op.add_column("employees", sa.Column("house_rent", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "medical" not in existing_employee_cols:
        op.add_column("employees", sa.Column("medical", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "conveyance" not in existing_employee_cols:
        op.add_column("employees", sa.Column("conveyance", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "food_allowance" not in existing_employee_cols:
        op.add_column("employees", sa.Column("food_allowance", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "wages" not in existing_employee_cols:
        op.add_column("employees", sa.Column("wages", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "increment" not in existing_employee_cols:
        op.add_column("employees", sa.Column("increment", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "total_salary" not in existing_employee_cols:
        op.add_column("employees", sa.Column("total_salary", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "mobile_bill" not in existing_employee_cols:
        op.add_column("employees", sa.Column("mobile_bill", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "shift_benefit" not in existing_employee_cols:
        op.add_column("employees", sa.Column("shift_benefit", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "wages_of_month" not in existing_employee_cols:
        op.add_column("employees", sa.Column("wages_of_month", sa.Numeric(10, 2), server_default=sa.text("0")))
    if "days_of_month" not in existing_employee_cols:
        op.add_column("employees", sa.Column("days_of_month", sa.Integer(), server_default=sa.text("26")))

    if "monthly_payroll" not in existing_tables:
        op.create_table(
            "monthly_payroll",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("employee_id", sa.String(36), sa.ForeignKey("employees.id"), nullable=False, index=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("month", sa.Integer(), nullable=False),
            sa.Column("year", sa.Integer(), nullable=False),
            sa.Column("days_of_month", sa.Integer(), server_default=sa.text("26")),
            sa.Column("calculate_days", sa.Numeric(5, 2), server_default=sa.text("0")),
            sa.Column("actual_attendance", sa.Integer(), server_default=sa.text("0")),
            sa.Column("day_off", sa.Integer(), server_default=sa.text("0")),
            sa.Column("cl", sa.Integer(), server_default=sa.text("0")),
            sa.Column("sl", sa.Integer(), server_default=sa.text("0")),
            sa.Column("el", sa.Integer(), server_default=sa.text("0")),
            sa.Column("comp_leave", sa.Integer(), server_default=sa.text("0")),
            sa.Column("festival_holiday", sa.Integer(), server_default=sa.text("0")),
            sa.Column("absent_days", sa.Integer(), server_default=sa.text("0")),
            sa.Column("payable_days", sa.Numeric(5, 2), server_default=sa.text("0")),
            sa.Column("payable_salary", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("ot_hours", sa.Numeric(5, 2), server_default=sa.text("0")),
            sa.Column("ot_amount", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("festival_duty_benefit", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("festival_holiday_allowance", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("ifter_days", sa.Integer(), server_default=sa.text("0")),
            sa.Column("ifter_allowance", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("special_food", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("attendance_bonus", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("arrear_others", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("shift_qty", sa.Integer(), server_default=sa.text("0")),
            sa.Column("shift_amount", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("roster_qty", sa.Integer(), server_default=sa.text("0")),
            sa.Column("roster_amount", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("absent_deduction", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("advance_deduction", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("tax_deduction", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("net_payable", sa.Numeric(10, 2), server_default=sa.text("0")),
            sa.Column("is_finalized", sa.Boolean(), server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )
        op.create_unique_constraint("uq_payroll_emp_month_year", "monthly_payroll", ["employee_id", "month", "year"])


def downgrade() -> None:
    op.drop_constraint("uq_payroll_emp_month_year", "monthly_payroll")
    op.drop_table("monthly_payroll")
    op.drop_column("employees", "days_of_month")
    op.drop_column("employees", "wages_of_month")
    op.drop_column("employees", "shift_benefit")
    op.drop_column("employees", "mobile_bill")
    op.drop_column("employees", "total_salary")
    op.drop_column("employees", "increment")
    op.drop_column("employees", "wages")
    op.drop_column("employees", "food_allowance")
    op.drop_column("employees", "conveyance")
    op.drop_column("employees", "medical")
    op.drop_column("employees", "house_rent")
    op.drop_column("employees", "basic")
    op.drop_column("employees", "bank_account_no")
    op.drop_column("employees", "department_name")
    op.drop_column("employees", "section")
    op.drop_column("employees", "designation")
    op.drop_column("employees", "grade")
    op.drop_column("employees", "gender")
    op.drop_column("employees", "age")
    op.drop_column("employees", "dob")
    op.drop_column("employees", "gen")
    op.drop_column("employees", "joining_date")
    op.drop_column("employees", "employee_id")
    op.drop_column("employees", "sl_no")

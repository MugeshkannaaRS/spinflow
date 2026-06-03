"""sprint1_masters — add master tables and extend machine/shift

Revision ID: 003
Revises: 002
Create Date: 2026-05-22
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ── Companies ───────────────────────────────────────
    if "companies" not in existing_tables:
        op.create_table(
            "companies",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("code", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("gstin", sa.String(20), nullable=True),
            sa.Column("address", sa.Text, nullable=True),
            sa.Column("phone", sa.String(20), nullable=True),
            sa.Column("email", sa.String(200), nullable=True),
            sa.Column("logo_url", sa.String(500), nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Mills ───────────────────────────────────────────
    if "mills" not in existing_tables:
        op.create_table(
            "mills",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("company_id", sa.String(36), sa.ForeignKey("companies.id"), nullable=False, index=True),
            sa.Column("code", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("address", sa.Text, nullable=True),
            sa.Column("city", sa.String(100), nullable=True),
            sa.Column("state", sa.String(100), nullable=True),
            sa.Column("pincode", sa.String(10), nullable=True),
            sa.Column("phone", sa.String(20), nullable=True),
            sa.Column("email", sa.String(200), nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Master Departments ──────────────────────────────
    if "master_departments" not in existing_tables:
        op.create_table(
            "master_departments",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("code", sa.String(50), nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("department_type", sa.String(50), nullable=False),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_unique_constraint("uq_master_departments_mill_code", "master_departments", ["mill_id", "code"])

    # ── Yarn Counts ─────────────────────────────────────
    if "yarn_counts" not in existing_tables:
        op.create_table(
            "yarn_counts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("count", sa.String(20), nullable=False),
            sa.Column("count_value", sa.Float, nullable=False),
            sa.Column("blend", sa.String(200), nullable=True),
            sa.Column("twist_per_meter", sa.Float, nullable=True),
            sa.Column("standard_csp", sa.Float, nullable=True),
            sa.Column("standard_u_percent", sa.Float, nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )
        op.create_unique_constraint("uq_yarn_counts_mill_count", "yarn_counts", ["mill_id", "count"])

    # ── Customers ───────────────────────────────────────
    if "customers" not in existing_tables:
        op.create_table(
            "customers",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("code", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("gstin", sa.String(20), nullable=True),
            sa.Column("pan", sa.String(20), nullable=True),
            sa.Column("billing_address", sa.Text, nullable=True),
            sa.Column("shipping_address", sa.Text, nullable=True),
            sa.Column("city", sa.String(100), nullable=True),
            sa.Column("state", sa.String(100), nullable=True),
            sa.Column("pincode", sa.String(10), nullable=True),
            sa.Column("contact_person", sa.String(200), nullable=True),
            sa.Column("phone", sa.String(20), nullable=True),
            sa.Column("email", sa.String(200), nullable=True),
            sa.Column("credit_limit", sa.Float, server_default=sa.text("0"), nullable=False),
            sa.Column("payment_terms_days", sa.Integer, server_default=sa.text("30"), nullable=False),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Master Vehicles ─────────────────────────────────
    if "master_vehicles" not in existing_tables:
        op.create_table(
            "master_vehicles",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("vehicle_no", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("vehicle_type", sa.String(20), nullable=False),
            sa.Column("make", sa.String(100), nullable=True),
            sa.Column("model", sa.String(100), nullable=True),
            sa.Column("capacity_kg", sa.Float, nullable=True),
            sa.Column("driver_name", sa.String(200), nullable=True),
            sa.Column("driver_phone", sa.String(20), nullable=True),
            sa.Column("driver_license", sa.String(50), nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Master Routes ───────────────────────────────────
    if "master_routes" not in existing_tables:
        op.create_table(
            "master_routes",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("code", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("origin", sa.String(200), nullable=False),
            sa.Column("destination", sa.String(200), nullable=False),
            sa.Column("distance_km", sa.Float, nullable=True),
            sa.Column("estimated_hours", sa.Float, nullable=True),
            sa.Column("is_active", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Extend machines ─────────────────────────────────
    existing_machine_cols = [c["name"] for c in inspector.get_columns("machines")]
    if "mill_id" not in existing_machine_cols:
        op.add_column("machines", sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=True, index=True))
    if "department_id" not in existing_machine_cols:
        op.add_column("machines", sa.Column("department_id", sa.String(36), sa.ForeignKey("master_departments.id"), nullable=True, index=True))
    if "serial_no" not in existing_machine_cols:
        op.add_column("machines", sa.Column("serial_no", sa.String(100), nullable=True))
    if "installation_date" not in existing_machine_cols:
        op.add_column("machines", sa.Column("installation_date", sa.Date, nullable=True))
    if "amc_expiry" not in existing_machine_cols:
        op.add_column("machines", sa.Column("amc_expiry", sa.Date, nullable=True))

    # ── Extend shifts ───────────────────────────────────
    existing_shift_cols = [c["name"] for c in inspector.get_columns("shifts")]
    if "mill_id" not in existing_shift_cols:
        op.add_column("shifts", sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=True, index=True))


def downgrade() -> None:
    op.drop_column("shifts", "mill_id")
    op.drop_column("machines", "amc_expiry")
    op.drop_column("machines", "installation_date")
    op.drop_column("machines", "serial_no")
    op.drop_column("machines", "department_id")
    op.drop_column("machines", "mill_id")
    op.drop_table("master_routes")
    op.drop_table("master_vehicles")
    op.drop_table("customers")
    op.drop_table("yarn_counts")
    op.drop_table("master_departments")
    op.drop_table("mills")
    op.drop_table("companies")

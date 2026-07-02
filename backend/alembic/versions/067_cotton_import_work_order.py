"""cotton imports + work orders (procurement extension)

Adds:
  - cotton_imports    : raw-cotton consignments under L/C (StoneX, Cargill, ...)
  - work_orders       : purchase work orders to suppliers (e.g. Texcorp spares)
  - work_order_items  : WO line items

Revision ID: 067_cotton_import_work_order
Revises: 066_maintenance_dept_map
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa


revision = "067_cotton_import_work_order"
down_revision = "066_maintenance_dept_map"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "cotton_imports" not in tables:
        op.create_table(
            "cotton_imports",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("mill_id", sa.String(length=36), nullable=True),
            sa.Column("date", sa.String(length=10), nullable=False),
            sa.Column("commercial_invoice_no", sa.String(length=100), nullable=False),
            sa.Column("contract_no", sa.String(length=100), nullable=True),
            sa.Column("proforma_ref", sa.String(length=100), nullable=True),
            sa.Column("supplier_name", sa.String(length=200), nullable=False),
            sa.Column("supplier_country", sa.String(length=100), nullable=True),
            sa.Column("applicant", sa.String(length=200), nullable=True),
            sa.Column("origin", sa.String(length=100), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("crop_year", sa.String(length=20), nullable=True),
            sa.Column("grade", sa.String(length=50), nullable=True),
            sa.Column("staple", sa.String(length=50), nullable=True),
            sa.Column("micronaire", sa.String(length=50), nullable=True),
            sa.Column("strength", sa.String(length=50), nullable=True),
            sa.Column("total_bales", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("gross_kg", sa.Float(), server_default="0"),
            sa.Column("tare_kg", sa.Float(), server_default="0"),
            sa.Column("net_kg", sa.Float(), server_default="0"),
            sa.Column("equiv_lbs", sa.Float(), server_default="0"),
            sa.Column("unit_price", sa.Numeric(12, 4), server_default="0"),
            sa.Column("unit_uom", sa.String(length=20), server_default="cents/lb"),
            sa.Column("fob_usd", sa.Numeric(16, 2), server_default="0"),
            sa.Column("freight_usd", sa.Numeric(16, 2), server_default="0"),
            sa.Column("total_usd", sa.Numeric(16, 2), server_default="0"),
            sa.Column("hs_code", sa.String(length=30), nullable=True),
            sa.Column("lc_no", sa.String(length=60), nullable=True),
            sa.Column("lc_date", sa.String(length=10), nullable=True),
            sa.Column("bl_no", sa.String(length=60), nullable=True),
            sa.Column("vessel", sa.String(length=120), nullable=True),
            sa.Column("shipped_from", sa.String(length=120), nullable=True),
            sa.Column("shipped_to", sa.String(length=120), nullable=True),
            sa.Column("trade_terms", sa.String(length=120), nullable=True),
            sa.Column("container_split", sa.Text(), nullable=True),
            sa.Column("invoice_url", sa.String(length=500), nullable=True),
            sa.Column("status", sa.String(length=20), server_default="in-transit"),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("mill_id", "commercial_invoice_no", name="uq_cotton_imports_mill_invoice"),
        )
        op.create_index("ix_cotton_imports_mill_id", "cotton_imports", ["mill_id"])
        op.create_index("ix_cotton_imports_date", "cotton_imports", ["date"])
        op.create_index("ix_cotton_imports_lc_no", "cotton_imports", ["lc_no"])

    if "work_orders" not in tables:
        op.create_table(
            "work_orders",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("mill_id", sa.String(length=36), nullable=True),
            sa.Column("wo_no", sa.String(length=60), nullable=False),
            sa.Column("date", sa.String(length=10), nullable=False),
            sa.Column("supplier_id", sa.String(length=36), nullable=True),
            sa.Column("supplier_name", sa.String(length=200), nullable=False),
            sa.Column("supplier_address", sa.Text(), nullable=True),
            sa.Column("attn_person", sa.String(length=200), nullable=True),
            sa.Column("subject", sa.String(length=200), server_default="Work Order"),
            sa.Column("currency", sa.String(length=10), server_default="BDT"),
            sa.Column("net_payable", sa.Numeric(16, 2), server_default="0"),
            sa.Column("amount_in_words", sa.String(length=300), nullable=True),
            sa.Column("terms", sa.Text(), nullable=True),
            sa.Column("contact_person", sa.String(length=200), nullable=True),
            sa.Column("contact_phone", sa.String(length=40), nullable=True),
            sa.Column("prepared_by", sa.String(length=200), nullable=True),
            sa.Column("authorised_by", sa.String(length=200), nullable=True),
            sa.Column("status", sa.String(length=20), server_default="open"),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("mill_id", "wo_no", name="uq_work_orders_mill_no"),
        )
        op.create_index("ix_work_orders_mill_id", "work_orders", ["mill_id"])
        op.create_index("ix_work_orders_date", "work_orders", ["date"])

    if "work_order_items" not in tables:
        op.create_table(
            "work_order_items",
            sa.Column("id", sa.String(length=36), nullable=False),
            sa.Column("work_order_id", sa.String(length=36), nullable=False),
            sa.Column("sl_no", sa.Integer(), server_default="1"),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("unit", sa.String(length=30), nullable=True),
            sa.Column("qty", sa.Float(), server_default="0"),
            sa.Column("unit_price", sa.Numeric(16, 2), server_default="0"),
            sa.Column("amount", sa.Numeric(16, 2), server_default="0"),
            sa.PrimaryKeyConstraint("id"),
            sa.ForeignKeyConstraint(["work_order_id"], ["work_orders.id"], ondelete="CASCADE"),
        )
        op.create_index("ix_work_order_items_wo", "work_order_items", ["work_order_id"])


def downgrade() -> None:
    op.drop_table("work_order_items")
    op.drop_table("work_orders")
    op.drop_table("cotton_imports")

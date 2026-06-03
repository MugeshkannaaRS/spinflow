"""sprint2_stock_ledger — stock ledger, balance, sales orders, transfers

Revision ID: 004
Revises: 003
Create Date: 2026-05-22
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()

    # ── Stock Ledger ─────────────────────────────────────
    if "stock_ledger" not in existing_tables:
        op.create_table(
            "stock_ledger",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=True, index=True),
            sa.Column("warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False, index=True),
            sa.Column("move_type", sa.String(50), nullable=False),
            sa.Column("qty_in", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("qty_out", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("weight_in_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("weight_out_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("ref_doc_type", sa.String(50), nullable=True),
            sa.Column("ref_doc_id", sa.String(36), nullable=True, index=True),
            sa.Column("lot_no", sa.String(50), nullable=True),
            sa.Column("yarn_count", sa.String(20), nullable=True),
            sa.Column("warehouse_code", sa.String(50), nullable=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
            sa.Column("shift_id", sa.String(36), sa.ForeignKey("shifts.id"), nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True, nullable=False),
        )
        op.create_index("ix_stock_ledger_mill_created", "stock_ledger", ["mill_id", "created_at"])
        op.create_index("ix_stock_ledger_ref_doc", "stock_ledger", ["ref_doc_id"])

    # ── Stock Balance ────────────────────────────────────
    if "stock_balance" not in existing_tables:
        op.create_table(
            "stock_balance",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False),
            sa.Column("warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False),
            sa.Column("fg_state", sa.String(30), server_default=sa.text("'WIP'"), nullable=False),
            sa.Column("qty_on_hand", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("qty_reserved", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("qty_quarantine", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("weight_on_hand_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("weight_reserved_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("last_move_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.create_unique_constraint("uq_balance_mill_lot_wh", "stock_balance", ["mill_id", "lot_id", "warehouse_id"])
        op.create_index("ix_stock_balance_mill_state", "stock_balance", ["mill_id", "fg_state"])

    # ── Sales Orders ─────────────────────────────────────
    if "sales_orders" not in existing_tables:
        op.create_table(
            "sales_orders",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("so_no", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("customer_id", sa.String(36), sa.ForeignKey("customers.id"), nullable=False, index=True),
            sa.Column("status", sa.String(30), server_default=sa.text("'draft'"), nullable=False),
            sa.Column("order_date", sa.String(10), nullable=False),
            sa.Column("delivery_date", sa.String(10), nullable=True),
            sa.Column("yarn_count", sa.String(20), nullable=True),
            sa.Column("total_bags", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("total_weight_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
            sa.Column("rate_per_kg", sa.Float, nullable=True),
            sa.Column("total_value", sa.Float, nullable=True),
            sa.Column("incoterms", sa.String(50), nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("confirmed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("cancelled_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # ── Sales Order Lines ────────────────────────────────
    if "sales_order_lines" not in existing_tables:
        op.create_table(
            "sales_order_lines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("so_id", sa.String(36), sa.ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False),
            sa.Column("warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False),
            sa.Column("bags_ordered", sa.Integer, nullable=False),
            sa.Column("bags_delivered", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("bags_reserved", sa.Integer, server_default=sa.text("0"), nullable=False),
            sa.Column("weight_kg", sa.Float, nullable=False),
            sa.Column("rate_per_kg", sa.Float, nullable=True),
            sa.Column("line_amount", sa.Float, nullable=True),
            sa.Column("status", sa.String(30), server_default=sa.text("'open'"), nullable=False),
        )

    # ── Stock Transfers ──────────────────────────────────
    if "stock_transfers" not in existing_tables:
        op.create_table(
            "stock_transfers",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
            sa.Column("transfer_no", sa.String(50), unique=True, nullable=False, index=True),
            sa.Column("from_warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False),
            sa.Column("to_warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False),
            sa.Column("status", sa.String(30), server_default=sa.text("'draft'"), nullable=False),
            sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False),
            sa.Column("bags_count", sa.Integer, nullable=False),
            sa.Column("weight_kg", sa.Float, nullable=False),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("confirmed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("completed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )


def downgrade() -> None:
    op.drop_table("stock_transfers")
    op.drop_table("sales_order_lines")
    op.drop_table("sales_orders")
    op.drop_table("stock_balance")
    op.drop_table("stock_ledger")

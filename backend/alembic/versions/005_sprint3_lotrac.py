"""sprint3_lotrac — LoTrac trip logistics tables

Revision ID: 005
Revises: 004
Create Date: 2026-05-22
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Inventory Bags ────────────────────────────────────
    op.create_table(
        "inventory_bags",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
        sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False, index=True),
        sa.Column("bag_no", sa.String(50), nullable=False, index=True),
        sa.Column("lot_no", sa.String(50), nullable=False),
        sa.Column("yarn_count", sa.String(20), nullable=True),
        sa.Column("weight_kg", sa.Float, server_default=sa.text("23.0"), nullable=False),
        sa.Column("qr_code", sa.String(1000), nullable=True),
        sa.Column("status", sa.String(30), server_default=sa.text("'available'"), nullable=False),
        sa.Column("warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_unique_constraint("uq_lot_bag_no", "inventory_bags", ["lot_id", "bag_no"])

    # ── Trips ─────────────────────────────────────────────
    op.create_table(
        "trips",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("mill_id", sa.String(36), sa.ForeignKey("mills.id"), nullable=False, index=True),
        sa.Column("trip_no", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("sales_order_id", sa.String(36), sa.ForeignKey("sales_orders.id"), nullable=True),
        sa.Column("vehicle_id", sa.String(36), sa.ForeignKey("master_vehicles.id"), nullable=True),
        sa.Column("vehicle_no", sa.String(50), nullable=True),
        sa.Column("driver_name", sa.String(200), nullable=True),
        sa.Column("driver_mobile", sa.String(20), nullable=True),
        sa.Column("from_warehouse_id", sa.String(36), sa.ForeignKey("warehouses.id"), nullable=False),
        sa.Column("destination_route_id", sa.String(36), sa.ForeignKey("master_routes.id"), nullable=True),
        sa.Column("destination_name", sa.String(200), nullable=True),
        sa.Column("customer_id", sa.String(36), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("status", sa.String(30), server_default=sa.text("'draft'"), nullable=False, index=True),
        sa.Column("planned_bags", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("loaded_bags", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("delivered_bags", sa.Integer, server_default=sa.text("0"), nullable=False),
        sa.Column("planned_weight_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
        sa.Column("loaded_weight_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
        sa.Column("delivered_weight_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
        sa.Column("loader_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("receiver_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("loading_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("loading_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("departure_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("arrived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pod_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("pod_confirmed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_trips_mill_status", "trips", ["mill_id", "status"])

    # ── Trip Items ────────────────────────────────────────
    op.create_table(
        "trip_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("trip_id", sa.String(36), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False),
        sa.Column("bag_id", sa.String(36), sa.ForeignKey("inventory_bags.id"), nullable=True),
        sa.Column("bag_no", sa.String(50), nullable=False),
        sa.Column("lot_no", sa.String(50), nullable=False),
        sa.Column("yarn_count", sa.String(20), nullable=True),
        sa.Column("planned_weight_kg", sa.Float, server_default=sa.text("0.0"), nullable=False),
        sa.Column("loaded_weight_kg", sa.Float, nullable=True),
        sa.Column("delivered_weight_kg", sa.Float, nullable=True),
        sa.Column("qr_code", sa.String(1000), nullable=True),
        sa.Column("loader_scan_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("loader_scan_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("receiver_scan_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("receiver_scan_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("item_status", sa.String(30), server_default=sa.text("'pending'"), nullable=False, index=True),
        sa.Column("wrong_destination_detected", sa.Boolean, server_default=sa.text("false"), nullable=False),
        sa.Column("wrong_destination_scanned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_trip_items_trip_status", "trip_items", ["trip_id", "item_status"])

    # ── Trip Scan Logs ────────────────────────────────────
    op.create_table(
        "trip_scan_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("trip_id", sa.String(36), sa.ForeignKey("trips.id"), nullable=False, index=True),
        sa.Column("trip_item_id", sa.String(36), sa.ForeignKey("trip_items.id"), nullable=True),
        sa.Column("scan_type", sa.String(30), nullable=False),
        sa.Column("qr_code", sa.String(1000), nullable=False),
        sa.Column("scanned_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scanned_at", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True, nullable=False),
        sa.Column("result", sa.String(30), nullable=False),
        sa.Column("device_info", sa.String(500), nullable=True),
        sa.Column("ip_address", sa.String(50), nullable=True),
        sa.Column("payload_data", JSONB, nullable=True),
    )
    op.create_index("ix_trip_scan_logs_trip_scanned", "trip_scan_logs", ["trip_id", "scanned_at"])


def downgrade() -> None:
    op.drop_table("trip_scan_logs")
    op.drop_table("trip_items")
    op.drop_table("trips")
    op.drop_table("inventory_bags")

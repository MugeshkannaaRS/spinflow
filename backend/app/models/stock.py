from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from app.db.base import Base, generate_uuid


class StockLedger(Base):
    __tablename__ = "stock_ledger"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True, index=True)
    warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False, index=True)
    move_type: Mapped[str] = mapped_column(String(50), nullable=False)
    qty_in: Mapped[float] = mapped_column(Float, default=0.0)
    qty_out: Mapped[float] = mapped_column(Float, default=0.0)
    weight_in_kg: Mapped[float] = mapped_column(Float, default=0.0)
    weight_out_kg: Mapped[float] = mapped_column(Float, default=0.0)
    ref_doc_type: Mapped[str] = mapped_column(String(50), nullable=True)
    ref_doc_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=True)
    yarn_count: Mapped[str] = mapped_column(String(20), nullable=True)
    warehouse_code: Mapped[str] = mapped_column(String(50), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    shift_id: Mapped[str] = mapped_column(String(36), ForeignKey("shifts.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), index=True, nullable=False)


class StockBalance(Base):
    __tablename__ = "stock_balance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False)
    fg_state: Mapped[str] = mapped_column(String(30), nullable=False, default="WIP")
    qty_on_hand: Mapped[float] = mapped_column(Float, default=0.0)
    qty_reserved: Mapped[float] = mapped_column(Float, default=0.0)
    qty_quarantine: Mapped[float] = mapped_column(Float, default=0.0)
    weight_on_hand_kg: Mapped[float] = mapped_column(Float, default=0.0)
    weight_reserved_kg: Mapped[float] = mapped_column(Float, default=0.0)
    last_move_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("mill_id", "lot_id", "warehouse_id", name="uq_balance_mill_lot_wh"),
        {"extend_existing": True},
    )

    @property
    def qty_available(self) -> float:
        return self.qty_on_hand - self.qty_reserved


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    __table_args__ = (
        UniqueConstraint("mill_id", "so_no", name="uq_sales_orders_mill_so_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    so_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    order_date: Mapped[str] = mapped_column(String(10), nullable=False)
    delivery_date: Mapped[str] = mapped_column(String(10), nullable=True)
    yarn_count: Mapped[str] = mapped_column(String(20), nullable=True)
    total_bags: Mapped[int] = mapped_column(Integer, default=0)
    total_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    rate_per_kg: Mapped[float] = mapped_column(Float, nullable=True)
    total_value: Mapped[float] = mapped_column(Float, nullable=True)
    incoterms: Mapped[str] = mapped_column(String(50), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    confirmed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), onupdate=func.now(), nullable=False)

    lines = relationship("SalesOrderLine", backref="order", cascade="all, delete-orphan", lazy="selectin")


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    so_id: Mapped[str] = mapped_column(String(36), ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False)
    warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False)
    bags_ordered: Mapped[int] = mapped_column(Integer, nullable=False)
    bags_delivered: Mapped[int] = mapped_column(Integer, default=0)
    bags_reserved: Mapped[int] = mapped_column(Integer, default=0)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    rate_per_kg: Mapped[float] = mapped_column(Float, nullable=True)
    line_amount: Mapped[float] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="open")


class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    __table_args__ = (
        UniqueConstraint("mill_id", "transfer_no", name="uq_stock_transfers_mill_transfer_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    transfer_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    from_warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft")
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False)
    bags_count: Mapped[int] = mapped_column(Integer, nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    confirmed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    completed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), nullable=False)

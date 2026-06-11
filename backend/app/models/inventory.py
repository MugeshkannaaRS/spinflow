from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base, TimestampMixin, generate_uuid
import enum


class LotStatus(str, enum.Enum):
    IN_STOCK = "in-stock"
    TRANSFERRED = "transferred"
    DISPATCHED = "dispatched"


class InventoryItem(TimestampMixin, Base):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="kg")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Lot(TimestampMixin, Base):
    __tablename__ = "lots"

    __table_args__ = (
        UniqueConstraint("mill_id", "lot_no", name="uq_lots_mill_lot_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="kg")
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=True)
    grade: Mapped[str] = mapped_column(String(10), nullable=True)
    produced_date: Mapped[str] = mapped_column(String(10), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="in-stock")
    total_bags: Mapped[int] = mapped_column(Integer, default=0)
    quality_status: Mapped[str] = mapped_column(String(20), default="pending")
    qr_code: Mapped[str] = mapped_column(String(500), nullable=True)
    qr_token: Mapped[str] = mapped_column(String(500), nullable=True)


class StockMovement(TimestampMixin, Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=True)
    from_location: Mapped[str] = mapped_column(String(200), nullable=True)
    to_location: Mapped[str] = mapped_column(String(200), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="kg")
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    reference: Mapped[str] = mapped_column(String(200), nullable=True)
    transferred_by: Mapped[str] = mapped_column(String(200), nullable=True)


class InventoryBag(Base):
    __tablename__ = "inventory_bags"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False, index=True)
    bag_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=False)
    yarn_count: Mapped[str] = mapped_column(String(20), nullable=True)
    weight_kg: Mapped[float] = mapped_column(Float, default=23.0)
    qr_code: Mapped[str] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="available")
    warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("lot_id", "bag_no", name="uq_lot_bag_no"),
    )


class Warehouse(Base):
    __tablename__ = "warehouses"

    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_warehouses_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    capacity_bags: Mapped[int] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

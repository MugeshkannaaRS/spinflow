from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, func, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, timezone
from app.db.base import Base, generate_uuid


class Trip(Base):
    __tablename__ = "trips"

    __table_args__ = (
        UniqueConstraint("mill_id", "trip_no", name="uq_trips_mill_trip_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    trip_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    sales_order_id: Mapped[str] = mapped_column(String(36), ForeignKey("sales_orders.id"), nullable=True)
    vehicle_id: Mapped[str] = mapped_column(String(36), ForeignKey("master_vehicles.id"), nullable=True)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=True)
    driver_name: Mapped[str] = mapped_column(String(200), nullable=True)
    driver_mobile: Mapped[str] = mapped_column(String(20), nullable=True)
    from_warehouse_id: Mapped[str] = mapped_column(String(36), ForeignKey("warehouses.id"), nullable=False)
    destination_route_id: Mapped[str] = mapped_column(String(36), ForeignKey("master_routes.id"), nullable=True)
    destination_name: Mapped[str] = mapped_column(String(200), nullable=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    planned_bags: Mapped[int] = mapped_column(Integer, default=0)
    loaded_bags: Mapped[int] = mapped_column(Integer, default=0)
    delivered_bags: Mapped[int] = mapped_column(Integer, default=0)
    planned_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    loaded_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    delivered_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    loader_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    receiver_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    loading_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    loading_completed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    pod_confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    pod_confirmed_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("TripItem", back_populates="trip", cascade="all, delete-orphan", lazy="selectin")
    scan_logs = relationship("TripScanLog", back_populates="trip", cascade="all, delete-orphan", lazy="selectin")


class TripItem(Base):
    __tablename__ = "trip_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    trip_id: Mapped[str] = mapped_column(String(36), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=False)
    bag_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventory_bags.id"), nullable=True)
    bag_no: Mapped[str] = mapped_column(String(50), nullable=False)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=False)
    yarn_count: Mapped[str] = mapped_column(String(20), nullable=True)
    planned_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    loaded_weight_kg: Mapped[float] = mapped_column(Float, nullable=True)
    delivered_weight_kg: Mapped[float] = mapped_column(Float, nullable=True)
    qr_code: Mapped[str] = mapped_column(String(1000), nullable=True)
    loader_scan_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    loader_scan_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    receiver_scan_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    receiver_scan_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    item_status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    wrong_destination_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    wrong_destination_scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    trip = relationship("Trip", back_populates="items")


class TripScanLog(Base):
    __tablename__ = "trip_scan_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    trip_id: Mapped[str] = mapped_column(String(36), ForeignKey("trips.id"), nullable=False, index=True)
    trip_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("trip_items.id"), nullable=True)
    scan_type: Mapped[str] = mapped_column(String(30), nullable=False)
    qr_code: Mapped[str] = mapped_column(String(1000), nullable=False)
    scanned_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.now(timezone.utc), server_default=func.now(), index=True)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    device_info: Mapped[str] = mapped_column(String(500), nullable=True)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=True)
    payload_data: Mapped[dict] = mapped_column(JSON, nullable=True)

    trip = relationship("Trip", back_populates="scan_logs")

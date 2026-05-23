from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base, TimestampMixin, generate_uuid
from datetime import datetime
from app.db.base import Base, TimestampMixin, generate_uuid


class Dispatch(TimestampMixin, Base):
    __tablename__ = "dispatches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dispatch_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    order_no: Mapped[str] = mapped_column(String(50), nullable=True)
    customer: Mapped[str] = mapped_column(String(200), nullable=False)
    lot_id: Mapped[str] = mapped_column(String(36), ForeignKey("lots.id"), nullable=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=True)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=True)
    driver_name: Mapped[str] = mapped_column(String(200), nullable=True)
    driver_phone: Mapped[str] = mapped_column(String(20), nullable=True)
    eway_bill_no: Mapped[str] = mapped_column(String(100), nullable=True)
    invoice_no: Mapped[str] = mapped_column(String(50), nullable=True)
    total_bags: Mapped[int] = mapped_column(Integer, default=0)
    total_weight_kg: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    scanned_by: Mapped[str] = mapped_column(String(200), nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[str] = mapped_column(String(200), nullable=True)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    items = relationship("DispatchItem", back_populates="dispatch")


class DispatchItem(Base):
    __tablename__ = "dispatch_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dispatch_id: Mapped[str] = mapped_column(String(36), ForeignKey("dispatches.id"), nullable=False, index=True)
    lot_no: Mapped[str] = mapped_column(String(50), nullable=False)
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    package_type: Mapped[str] = mapped_column(String(50), nullable=True)
    package_count: Mapped[int] = mapped_column(Integer, default=0)

    dispatch = relationship("Dispatch", back_populates="items")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    vehicle_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    driver_name: Mapped[str] = mapped_column(String(200), nullable=True)
    driver_phone: Mapped[str] = mapped_column(String(20), nullable=True)
    transporter: Mapped[str] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class QRScan(Base):
    __tablename__ = "qr_scans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    token: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    station: Mapped[str] = mapped_column(String(100), nullable=False)
    scanned_by: Mapped[str] = mapped_column(String(200), nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    location: Mapped[str] = mapped_column(String(200), nullable=True)

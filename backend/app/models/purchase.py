from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from typing import Optional
from app.db.base import Base, TimestampMixin, generate_uuid


class Supplier(TimestampMixin, Base):
    __tablename__ = "suppliers"
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_suppliers_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_person: Mapped[str] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    state: Mapped[str] = mapped_column(String(100), nullable=True)
    gstin: Mapped[str] = mapped_column(String(20), nullable=True)
    grade: Mapped[str] = mapped_column(String(10), nullable=True)
    status: Mapped[bool] = mapped_column(Boolean, default=True)


class CottonPurchase(TimestampMixin, Base):
    __tablename__ = "cotton_purchases"
    __table_args__ = (
        UniqueConstraint("mill_id", "invoice_no", name="uq_cotton_purchases_mill_invoice"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    invoice_no: Mapped[str] = mapped_column(String(100), nullable=False)
    supplier_id: Mapped[str] = mapped_column(String(36), ForeignKey("suppliers.id"), nullable=False, index=True)
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=True)
    bales: Mapped[int] = mapped_column(Integer, nullable=False)
    gross_kg: Mapped[float] = mapped_column(Float, nullable=False)
    net_kg: Mapped[float] = mapped_column(Float, nullable=False)
    rate_per_kg: Mapped[float] = mapped_column(Numeric(12, 4), nullable=False)
    moisture: Mapped[float] = mapped_column(Float, default=0)
    grade: Mapped[str] = mapped_column(String(10), nullable=True)
    gst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    invoice_url: Mapped[str] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")


class BaleStock(Base):
    __tablename__ = "bale_stock"
    __table_args__ = (
        UniqueConstraint("purchase_id", "bale_no", name="uq_bale_stock_purchase_bale"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    purchase_id: Mapped[str] = mapped_column(String(36), ForeignKey("cotton_purchases.id"), nullable=False)
    bale_no: Mapped[str] = mapped_column(String(50), nullable=False)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    grade: Mapped[str] = mapped_column(String(10), nullable=True)
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="in-stock")


class CottonBale(TimestampMixin, Base):
    __tablename__ = "cotton_bales"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    company_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("companies.id"), nullable=True, index=True)
    bale_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    supplier: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    lot_number: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    date_received: Mapped[str] = mapped_column(String(10), nullable=False)
    micronaire: Mapped[float] = mapped_column(Float, nullable=False)
    staple_length: Mapped[float] = mapped_column(Float, nullable=True)
    strength: Mapped[float] = mapped_column(Float, nullable=True)
    uniformity: Mapped[float] = mapped_column(Float, nullable=True)
    short_fiber_index: Mapped[float] = mapped_column(Float, nullable=True)
    moisture: Mapped[float] = mapped_column(Float, nullable=True)
    trash_area: Mapped[float] = mapped_column(Float, nullable=True)
    trash_grade: Mapped[int] = mapped_column(Integer, nullable=True)
    color_grade: Mapped[str] = mapped_column(String(20), nullable=True)
    reflectance: Mapped[float] = mapped_column(Float, nullable=True)
    yellowness: Mapped[float] = mapped_column(Float, nullable=True)
    elongation: Mapped[float] = mapped_column(Float, nullable=True)
    maturity: Mapped[float] = mapped_column(Float, nullable=True)
    sci: Mapped[float] = mapped_column(Float, nullable=True)
    quality_index: Mapped[float] = mapped_column(Float, nullable=True)
    category: Mapped[str] = mapped_column(String(10), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="in-stock", index=True)


class GRNEntry(TimestampMixin, Base):
    __tablename__ = "grn_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    grn_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    purchase_id: Mapped[str] = mapped_column(String(36), ForeignKey("cotton_purchases.id"), nullable=False)
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=True)
    bales_received: Mapped[int] = mapped_column(Integer, nullable=False)
    net_kg: Mapped[float] = mapped_column(Float, nullable=False)
    received_by: Mapped[str] = mapped_column(String(200), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")

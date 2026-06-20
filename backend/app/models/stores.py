from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.base import Base, TimestampMixin, generate_uuid


class Spare(TimestampMixin, Base):
    __tablename__ = "spares"
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_spares_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    stock: Mapped[float] = mapped_column(Float, default=0)
    min_stock: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(20), default="pcs")
    location: Mapped[str] = mapped_column(String(200), nullable=True)
    vendor_id: Mapped[str] = mapped_column(String(36), ForeignKey("vendors.id"), nullable=True)
    vendor_name: Mapped[str] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SpareIssue(TimestampMixin, Base):
    __tablename__ = "spare_issues"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False)
    spare_id: Mapped[str] = mapped_column(String(36), ForeignKey("spares.id"), nullable=False, index=True)
    spare_code: Mapped[str] = mapped_column(String(50), nullable=True)
    spare_name: Mapped[str] = mapped_column(String(200), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    issued_to: Mapped[str] = mapped_column(String(200), nullable=True)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    purpose: Mapped[str] = mapped_column(Text, nullable=True)
    issued_by: Mapped[str] = mapped_column(String(200), nullable=True)


class Vendor(TimestampMixin, Base):
    __tablename__ = "vendors"
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_vendors_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    contact: Mapped[str] = mapped_column(String(100), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

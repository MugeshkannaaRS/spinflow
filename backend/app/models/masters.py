from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum, Date, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime, date
from app.db.base import Base, TimestampMixin, SoftDeleteMixin, generate_uuid
import enum


class DepartmentType(str, enum.Enum):
    BLOWROOM = "blowroom"
    CARDING = "carding"
    DRAWING = "drawing"
    SIMPLEX = "simplex"
    RING_FRAME = "ring_frame"
    WINDING = "winding"
    QUALITY = "quality"
    STORES = "stores"
    DISPATCH = "dispatch"
    HR = "hr"
    ACCOUNTS = "accounts"
    MAINTENANCE = "maintenance"
    ADMIN = "admin"


class VehicleType(str, enum.Enum):
    TRUCK = "truck"
    MINI_TRUCK = "mini_truck"
    LORRY = "lorry"
    TEMPO = "tempo"
    OTHER = "other"


class Company(TimestampMixin, Base):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    gstin: Mapped[str] = mapped_column(String(20), nullable=True)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    logo_url: Mapped[str] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mills = relationship("Mill", back_populates="company", cascade="all, delete-orphan")


class Mill(TimestampMixin, Base):
    __tablename__ = "mills"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    state: Mapped[str] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str] = mapped_column(String(10), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    company = relationship("Company", back_populates="mills")
    departments = relationship("Department", back_populates="mill", cascade="all, delete-orphan")
    yarn_counts = relationship("YarnCount", back_populates="mill", cascade="all, delete-orphan")
    customers = relationship("Customer", back_populates="mill", cascade="all, delete-orphan")
    routes = relationship("Route", back_populates="mill", cascade="all, delete-orphan")


class Department(TimestampMixin, Base):
    __tablename__ = "master_departments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    department_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="departments")


class YarnCount(TimestampMixin, Base):
    __tablename__ = "yarn_counts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    count: Mapped[str] = mapped_column(String(20), nullable=False)
    count_value: Mapped[float] = mapped_column(Float, nullable=False)
    blend: Mapped[str] = mapped_column(String(200), nullable=True)
    twist_per_meter: Mapped[float] = mapped_column(Float, nullable=True)
    standard_csp: Mapped[float] = mapped_column(Float, nullable=True)
    standard_u_percent: Mapped[float] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="yarn_counts")


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    gstin: Mapped[str] = mapped_column(String(20), nullable=True)
    pan: Mapped[str] = mapped_column(String(20), nullable=True)
    billing_address: Mapped[str] = mapped_column(Text, nullable=True)
    shipping_address: Mapped[str] = mapped_column(Text, nullable=True)
    city: Mapped[str] = mapped_column(String(100), nullable=True)
    state: Mapped[str] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str] = mapped_column(String(10), nullable=True)
    contact_person: Mapped[str] = mapped_column(String(200), nullable=True)
    phone: Mapped[str] = mapped_column(String(20), nullable=True)
    email: Mapped[str] = mapped_column(String(200), nullable=True)
    credit_limit: Mapped[float] = mapped_column(Float, default=0)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="customers")


class MasterVehicle(TimestampMixin, Base):
    __tablename__ = "master_vehicles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    vehicle_no: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    vehicle_type: Mapped[str] = mapped_column(String(20), nullable=False)
    make: Mapped[str] = mapped_column(String(100), nullable=True)
    model: Mapped[str] = mapped_column(String(100), nullable=True)
    capacity_kg: Mapped[float] = mapped_column(Float, nullable=True)
    driver_name: Mapped[str] = mapped_column(String(200), nullable=True)
    driver_phone: Mapped[str] = mapped_column(String(20), nullable=True)
    driver_license: Mapped[str] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Route(TimestampMixin, Base):
    __tablename__ = "master_routes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=True)
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="routes")

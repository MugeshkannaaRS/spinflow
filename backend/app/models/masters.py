from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum, Date, Numeric, JSON, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime, date
from typing import Optional
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
    max_users: Mapped[int] = mapped_column(Integer, default=50)
    plan: Mapped[str] = mapped_column(String(50), default="starter")
    max_employees: Mapped[int] = mapped_column(Integer, default=100)
    licence_fee: Mapped[Optional[float]] = mapped_column(Numeric(12,2), nullable=True, default=None)
    maintenance_fee: Mapped[Optional[float]] = mapped_column(Numeric(12,2), nullable=True, default=None)
    billing_cycle: Mapped[str] = mapped_column(String(20), default="annual")
    plan_started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    plan_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    addons: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="active")
    suspended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    archived_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)

    mills = relationship("Mill", back_populates="company", cascade="all, delete-orphan")
    modules = relationship("CompanyModule", back_populates="company", lazy="selectin")


class Mill(TimestampMixin, Base):
    __tablename__ = "mills"

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_mills_company_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
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
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_departments_mill_code"),
    )

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
    blend: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    twist_per_meter: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    standard_csp: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    standard_u_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # v2: blended yarn fields
    # e.g. {"cotton_cnc": 60, "polyester": 40} or {"cotton": 100}
    fiber_composition: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    # colour code for dyed/colour yarn e.g. "BLK001", "WHT", "NAT"
    colour_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # human-readable blend ratio e.g. "60:40 PC", "80:20 CVC"
    blend_ratio: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    mill = relationship("Mill", back_populates="yarn_counts")


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_customers_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
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
    credit_limit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    payment_terms_days: Mapped[int] = mapped_column(Integer, default=30)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="customers")


class MasterVehicle(TimestampMixin, Base):
    __tablename__ = "master_vehicles"
    __table_args__ = (
        UniqueConstraint("mill_id", "vehicle_no", name="uq_vehicles_mill_vehicle_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    vehicle_no: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
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
    __table_args__ = (
        UniqueConstraint("mill_id", "code", name="uq_routes_mill_code"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    distance_km: Mapped[float] = mapped_column(Float, nullable=True)
    estimated_hours: Mapped[float] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mill = relationship("Mill", back_populates="routes")


class CompanyModule(Base):
    __tablename__ = "company_modules"
    __table_args__ = (
        UniqueConstraint("company_id", "module_name", name="uq_company_modules_company_module"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    module_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    enabled_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    enabled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    company = relationship("Company", back_populates="modules")

    @property
    def enabled(self) -> bool:
        return self.is_enabled


class CompanyRoleConfig(Base):
    """Which roles are available for a company, with optional per-role monthly fee."""
    __tablename__ = "company_role_config"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    role_code: Mapped[str] = mapped_column(String(50), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    monthly_fee: Mapped[float] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    enabled_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "role_code", name="uq_company_role_config"),
    )


class RoleModuleAccess(Base):
    """Per-company overrides for which modules a role can access.
    A missing row means: use system default for that role+module combo."""
    __tablename__ = "role_module_access"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    role_code: Mapped[str] = mapped_column(String(50), nullable=False)
    module_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_allowed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    set_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("company_id", "role_code", "module_name", name="uq_role_module_access"),
    )


class MillSettings(Base):
    __tablename__ = "mill_settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), ForeignKey("mills.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    working_hours_per_day: Mapped[int] = mapped_column(Integer, default=24)
    shifts_per_day: Mapped[int] = mapped_column(Integer, default=3)
    production_target_kg: Mapped[float] = mapped_column(Float, default=0)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

from sqlalchemy import String, Float, Integer, Boolean, ForeignKey, Text, UniqueConstraint, Numeric
from sqlalchemy.orm import Mapped, mapped_column
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


class CottonImport(TimestampMixin, Base):
    """Imported raw-cotton consignment under L/C (e.g. StoneX Ivory Coast,
    Cargill Brazil). Richer than a domestic CottonPurchase — carries L/C,
    B/L, origin, FOB/freight/CFR, quality specs and the group container split.
    """
    __tablename__ = "cotton_imports"
    __table_args__ = (
        UniqueConstraint("mill_id", "commercial_invoice_no", name="uq_cotton_imports_mill_invoice"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # invoice date YYYY-MM-DD
    commercial_invoice_no: Mapped[str] = mapped_column(String(100), nullable=False)
    contract_no: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    proforma_ref: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Parties
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=False)        # StoneX / Cargill
    supplier_country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    applicant: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)   # buyer/applicant on L/C
    origin: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)      # Ivory Coast / Brazil
    # Goods + quality
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    crop_year: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    grade: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)        # e.g. Strict Middling
    staple: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)       # e.g. 1-5/32"
    micronaire: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)   # range e.g. 3.8-4.9
    strength: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)     # GPT e.g. 29 min
    # Quantity
    total_bales: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gross_kg: Mapped[float] = mapped_column(Float, default=0.0)
    tare_kg: Mapped[float] = mapped_column(Float, default=0.0)
    net_kg: Mapped[float] = mapped_column(Float, default=0.0)
    equiv_lbs: Mapped[float] = mapped_column(Float, default=0.0)
    # Pricing (USD)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), default=0)           # value of unit_uom
    unit_uom: Mapped[str] = mapped_column(String(20), default="cents/lb")
    fob_usd: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    freight_usd: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    total_usd: Mapped[float] = mapped_column(Numeric(16, 2), default=0)            # CFR total
    hs_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    # Trade / shipping
    lc_no: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    lc_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    bl_no: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    vessel: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    shipped_from: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    shipped_to: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    trade_terms: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)  # CFR CHATTOGRAM ...
    # Group allocation (JSON string e.g. {"AAYML":6,"MSA":6}) — containers/bales
    container_split: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    invoice_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="in-transit")           # in-transit/received/cleared
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class WorkOrder(TimestampMixin, Base):
    """Purchase work order to a supplier (e.g. Texcorp spares WO). Header + line
    items; may reference maintenance spares. Prints on the AA Yarn WO format.
    """
    __tablename__ = "work_orders"
    __table_args__ = (
        UniqueConstraint("mill_id", "wo_no", name="uq_work_orders_mill_no"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("mills.id"), nullable=True, index=True)
    wo_no: Mapped[str] = mapped_column(String(60), nullable=False)                  # AAYML/W.O/2026/182
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    supplier_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("suppliers.id"), nullable=True, index=True)
    supplier_name: Mapped[str] = mapped_column(String(200), nullable=False)
    supplier_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attn_person: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    subject: Mapped[str] = mapped_column(String(200), default="Work Order")
    currency: Mapped[str] = mapped_column(String(10), default="BDT")
    net_payable: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    amount_in_words: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    terms: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    contact_phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    prepared_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    authorised_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")                 # open/delivered/paid/cancelled
    remarks: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class WorkOrderItem(Base):
    __tablename__ = "work_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    work_order_id: Mapped[str] = mapped_column(String(36), ForeignKey("work_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    sl_no: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    qty: Mapped[float] = mapped_column(Float, default=0)
    unit_price: Mapped[float] = mapped_column(Numeric(16, 2), default=0)
    amount: Mapped[float] = mapped_column(Numeric(16, 2), default=0)


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

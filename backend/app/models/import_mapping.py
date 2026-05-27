import uuid
from sqlalchemy import Column, String, Boolean, Numeric, DateTime, UniqueConstraint
from sqlalchemy.sql import func
from app.db.base import Base

class ImportMapping(Base):
    __tablename__ = "import_mappings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    mill_id = Column(String(36), nullable=False)
    table_name = Column(String(100), nullable=False)
    excel_header = Column(String(200), nullable=False)
    spinflow_field = Column(String(100), nullable=True)
    is_custom_field = Column(Boolean, server_default="false", default=False)
    confidence = Column(Numeric(5, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("mill_id", "table_name", "excel_header", name="uq_import_mapping"),
    )

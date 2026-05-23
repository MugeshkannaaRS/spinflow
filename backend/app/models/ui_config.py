from sqlalchemy import String, Text, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime, timezone
from app.db.base import Base, generate_uuid


class ColumnConfig(Base):
    __tablename__ = "column_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    mill_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    table_key: Mapped[str] = mapped_column(String(50), nullable=False)
    columns: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(String(200), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

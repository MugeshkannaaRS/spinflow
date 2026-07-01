from sqlalchemy import String, Text, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.db.base import Base, generate_uuid


class DeletionLog(Base):
    __tablename__ = "deletion_log"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    company_name: Mapped[str] = mapped_column(String(200), nullable=False)
    company_code: Mapped[str] = mapped_column(String(50), nullable=False)
    deleted_by: Mapped[str] = mapped_column(String(36), nullable=False)
    deleted_by_name: Mapped[str] = mapped_column(String(200), nullable=True)
    deleted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    affected_records: Mapped[dict] = mapped_column(JSON, nullable=True)
    backup_location: Mapped[str] = mapped_column(String(500), nullable=True)
    backup_key: Mapped[str] = mapped_column(String(200), nullable=True)
    deletion_result: Mapped[str] = mapped_column(String(50), nullable=False, default="success")
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="hard")

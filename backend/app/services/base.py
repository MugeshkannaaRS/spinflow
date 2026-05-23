from typing import Generic, TypeVar, Optional, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.user import User
from app.models.audit import AuditLog
from app.core.error_handler import SpinFlowException

T = TypeVar("T")


class BaseService(Generic[T]):
    def __init__(self, db: AsyncSession, current_user: User):
        self.db = db
        self.current_user = current_user

    async def get_or_404(self, model: type[T], id: str) -> T:
        stmt = select(model).where(model.id == id)
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        result = await self.db.execute(stmt)
        obj = result.scalar_one_or_none()
        if not obj:
            raise SpinFlowException.not_found(model.__name__)
        return obj

    async def _audit(
        self,
        action: str,
        entity: str,
        entity_id: str,
        details: str,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
    ) -> AuditLog:
        role_code = self.current_user.role_rel.code if self.current_user.role_rel else "UNKNOWN"
        log = AuditLog(
            user_id=self.current_user.id,
            user_name=self.current_user.name,
            role=role_code,
            action=action,
            entity=entity,
            entity_id=entity_id,
            details=details,
            old_value=old_value,
            new_value=new_value,
            ip_address=getattr(self.current_user, "_current_ip", "0.0.0.0"),
        )
        self.db.add(log)
        return log

    async def _count(self, model: type[T], **filters: Any) -> int:
        stmt = select(func.count(model.id))
        for key, value in filters.items():
            column = getattr(model, key, None)
            if column is not None and value is not None:
                stmt = stmt.where(column == value)
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    def _pagination_meta(self, total: int, page: int, per_page: int) -> dict:
        return {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": (total + per_page - 1) // per_page if per_page > 0 else 0,
        }

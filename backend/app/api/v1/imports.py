import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope
from app.models.user import User
from app.models.import_mapping import ImportMapping

logger = logging.getLogger(__name__)

router = APIRouter()

class MappingItem(BaseModel):
    excel_header: str
    spinflow_field: Optional[str] = None
    is_custom_field: bool = False
    confidence: Optional[float] = None

class SaveMappingsRequest(BaseModel):
    mill_id: str
    table_name: str
    mappings: List[MappingItem]

@router.get("/import/mappings")
async def get_import_mappings(
    table: str = Query(...),
    mill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"] and scope["mill_id"] != mill_id:
        raise HTTPException(403, "Access denied")
    if scope["company_id"] and not scope["mill_id"]:
        from app.models.masters import Mill
        mill = await db.get(Mill, mill_id)
        if not mill or mill.company_id != scope["company_id"]:
            raise HTTPException(403, "Access denied")

    result = await db.execute(
        select(ImportMapping).where(
            ImportMapping.mill_id == mill_id,
            ImportMapping.table_name == table,
        )
    )
    mappings = result.scalars().all()
    return [
        {
            "id": m.id,
            "mill_id": m.mill_id,
            "table_name": m.table_name,
            "excel_header": m.excel_header,
            "spinflow_field": m.spinflow_field,
            "is_custom_field": m.is_custom_field,
            "confidence": float(m.confidence) if m.confidence is not None else None,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in mappings
    ]

@router.post("/import/mappings")
async def save_import_mappings(
    req: SaveMappingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    scope = await get_mill_scope(current_user)
    if scope["mill_id"] and scope["mill_id"] != req.mill_id:
        raise HTTPException(403, "Access denied")
    if scope["company_id"] and not scope["mill_id"]:
        from app.models.masters import Mill
        mill = await db.get(Mill, req.mill_id)
        if not mill or mill.company_id != scope["company_id"]:
            raise HTTPException(403, "Access denied")

    await db.execute(
        delete(ImportMapping).where(
            ImportMapping.mill_id == req.mill_id,
            ImportMapping.table_name == req.table_name,
        )
    )

    count = 0
    for item in req.mappings:
        mapping = ImportMapping(
            mill_id=req.mill_id,
            table_name=req.table_name,
            excel_header=item.excel_header,
            spinflow_field=item.spinflow_field,
            is_custom_field=item.is_custom_field,
            confidence=item.confidence,
        )
        db.add(mapping)
        count += 1

    await db.flush()
    return {"saved": count, "mill_id": req.mill_id, "table_name": req.table_name}

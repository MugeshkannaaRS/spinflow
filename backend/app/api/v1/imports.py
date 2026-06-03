import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope, require_module, log_audit
from app.core.limiter import limiter
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
    current_user: User = Depends(require_module("masters")),
):
    scope = await get_mill_scope(current_user, db)
    if scope["mill_id"] and scope["mill_id"] != mill_id:
        raise HTTPException(403, "Access denied")
    if scope["company_id"] and not scope["mill_id"]:
        from app.models.masters import Mill
        mill = await db.get(Mill, mill_id)
        if not mill or mill.company_id != scope["company_id"]:
            raise HTTPException(403, "Access denied")

    try:
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
    except Exception as e:
        logger.error(f"Error fetching import mappings for table={table}, mill={mill_id}: {e}", exc_info=True)
        return []

@router.post("/import/mappings")
@limiter.limit("10/minute")
async def save_import_mappings(
    request: Request,
    req: SaveMappingsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("masters", write=True)),
):
    scope = await get_mill_scope(current_user, db)
    if scope["mill_id"] and scope["mill_id"] != req.mill_id:
        raise HTTPException(403, "Access denied")
    if scope["company_id"] and not scope["mill_id"]:
        from app.models.masters import Mill
        mill = await db.get(Mill, req.mill_id)
        if not mill or mill.company_id != scope["company_id"]:
            raise HTTPException(403, "Access denied")

    try:
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

        await db.commit()
        role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
        client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
        await log_audit(db, current_user.id, role_code, "import_mappings", "import", req.mill_id, f"Saved {count} import mappings for {req.table_name}", ip_address=client_ip)
        return {"saved": count, "mill_id": req.mill_id, "table_name": req.table_name}
    except Exception as e:
        logger.error(f"Error saving import mappings: {e}", exc_info=True)
        return {"saved": False, "error": str(e)}

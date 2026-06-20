import os
import shutil
import uuid
import struct
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit, get_mill_scope
from app.core.config import settings
from app.core.limiter import limiter
from app.models.attachment import DocumentAttachment
from app.models.user import User
from app.models.masters import Mill
from app.models.hr import Employee
from app.models.purchase import CottonPurchase
from pydantic import BaseModel

router = APIRouter()

UPLOAD_DIR = Path("uploads")
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "text/csv": "csv",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/jpeg": "jpg",
    "image/png": "png",
}

def _detect_mime_type(data: bytes) -> str:
    """Detect MIME type from file content using magic bytes."""
    if len(data) < 8:
        return "application/octet-stream"
    # PDF: %PDF
    if data[:4] == b"%PDF":
        return "application/pdf"
    # PNG: 89 50 4E 47
    if data[:4] == b"\x89PNG":
        return "image/png"
    # JPEG: FF D8 FF
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    # ZIP (includes XLSX/DOCX): PK\x03\x04
    if data[:4] == b"PK\x03\x04":
        # Check for [Content_Types].xml to distinguish xlsx from generic zip
        if b"[Content_Types].xml" in data[:4096]:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        return "application/octet-stream"
    # CSV or plain text
    if data[:2] == b"\xff\xfe" or data[:2] == b"\xfe\xff":
        return "text/csv"
    try:
        text = data[:4096].decode("utf-8", errors="ignore")
        if "," in text[:200] or "\t" in text[:200]:
            return "text/csv"
    except Exception:
        pass
    return "application/octet-stream"


ALLOWED_ENTITY_TYPES = {
    "employee", "dispatch", "purchase", "quality", "maintenance",
    "production", "invoice", "payment", "contract", "report",
}


async def _check_entity_scope(db: AsyncSession, entity_type: str, entity_id: str, current_user: User) -> None:
    """Verify the entity belongs to the current user's company scope."""
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code == "SUPER_ADMIN":
        return
    scope = await get_mill_scope(current_user, db)
    company_id = scope.get("company_id")
    if not company_id:
        raise HTTPException(403, "No company scope")

    mill_id = None
    if entity_type == "employee":
        row = await db.get(Employee, entity_id)
        if row:
            mill_id = row.mill_id
    elif entity_type == "purchase":
        row = await db.get(CottonPurchase, entity_id)
        if row:
            mill_id = row.mill_id
    elif entity_type in ("dispatch", "quality", "maintenance", "production"):
        # These models require model-specific lookups; for now, rely on require_module
        return
    else:
        return

    if mill_id:
        mill = await db.get(Mill, mill_id)
        if not mill or str(mill.company_id) != company_id:
            raise HTTPException(404, "Entity not found")


class AttachmentResponse(BaseModel):
    id: str
    file_name: str
    file_size: int
    mime_type: str
    file_path: str
    created_at: str

    class Config:
        from_attributes = True


@router.post("/upload", response_model=AttachmentResponse)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("uploads", write=True)),
):
    await _check_entity_scope(db, entity_type, entity_id, current_user)
    MAX_SIZE = 10 * 1024 * 1024  # 10 MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Maximum size is 10MB, got {len(content) / 1024 / 1024:.1f}MB")

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' not allowed. Allowed: PDF, CSV, Excel, images",
        )

    # Validate file content via magic bytes (MIME header is client-controlled and untrustworthy)
    content_type = _detect_mime_type(content)
    if content_type != file.content_type:
        logger = __import__("logging").getLogger("spinflow")
        logger.warning(f"MIME type mismatch: header={file.content_type}, magic={content_type}")
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File content does not match allowed types. Detected: {content_type}",
        )
    file.content_type = content_type  # Use detected type

    if entity_type not in ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Entity type '{entity_type}' not allowed. Allowed: {', '.join(sorted(ALLOWED_ENTITY_TYPES))}",
        )

    ext = ALLOWED_TYPES[file.content_type]
    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}.{ext}"

    entity_dir = UPLOAD_DIR / entity_type
    entity_dir.mkdir(parents=True, exist_ok=True)
    file_path = entity_dir / safe_name

    file_path.write_bytes(content)

    attachment = DocumentAttachment(
        entity_type=entity_type,
        entity_id=entity_id,
        file_name=file.filename or safe_name,
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        file_path=str(file_path),
        uploaded_by=current_user.name,
    )
    db.add(attachment)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "upload", entity_type, entity_id, f"Uploaded file: {file.filename} ({len(content)} bytes)", ip_address=client_ip)

    return AttachmentResponse(
        id=attachment.id,
        file_name=attachment.file_name,
        file_size=attachment.file_size,
        mime_type=attachment.mime_type,
        file_path=attachment.file_path,
        created_at=str(attachment.created_at),
    )


@router.get("/attachments/{entity_type}/{entity_id}", response_model=List[AttachmentResponse])
async def list_attachments(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("uploads")),
):
    await _check_entity_scope(db, entity_type, entity_id, current_user)
    result = await db.execute(
        select(DocumentAttachment)
        .where(
            DocumentAttachment.entity_type == entity_type,
            DocumentAttachment.entity_id == entity_id,
        )
        .order_by(DocumentAttachment.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/attachments/{attachment_id}")
async def delete_attachment(
    request: Request,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("uploads", write=True)),
):
    result = await db.execute(
        select(DocumentAttachment).where(DocumentAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    await _check_entity_scope(db, attachment.entity_type, attachment.entity_id, current_user)
    file_path = Path(attachment.file_path)
    if file_path.exists():
        file_path.unlink()

    entity_type = attachment.entity_type
    entity_id = attachment.entity_id
    file_name = attachment.file_name
    await db.delete(attachment)
    await db.flush()
    role_code = current_user.role_rel.code if current_user.role_rel else "UNKNOWN"
    client_ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "0.0.0.0").split(",")[0].strip()
    await log_audit(db, current_user.id, role_code, "delete_attachment", entity_type, entity_id, f"Deleted attachment: {file_name}", ip_address=client_ip)
    return {"message": "Attachment deleted"}

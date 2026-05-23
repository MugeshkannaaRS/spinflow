import os
import shutil
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional, List

from app.db.session import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.models.attachment import DocumentAttachment
from app.models.user import User
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
async def upload_file(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{file.content_type}' not allowed. Allowed: PDF, CSV, Excel, images",
        )

    ext = ALLOWED_TYPES[file.content_type]
    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}.{ext}"

    entity_dir = UPLOAD_DIR / entity_type
    entity_dir.mkdir(parents=True, exist_ok=True)
    file_path = entity_dir / safe_name

    content = await file.read()
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
    current_user: User = Depends(get_current_user),
):
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
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(DocumentAttachment).where(DocumentAttachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = Path(attachment.file_path)
    if file_path.exists():
        file_path.unlink()

    await db.delete(attachment)
    return {"message": "Attachment deleted"}

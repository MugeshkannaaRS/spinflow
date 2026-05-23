from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import hmac
import hashlib
import json
import base64

from app.db.session import get_db
from app.core.deps import get_current_user, require_module, log_audit
from app.core.config import settings
from app.models.user import User
from app.models.inventory import Lot
from app.models.dispatch import QRScan
from pydantic import BaseModel

router = APIRouter()


def sign_qr_payload(payload: dict) -> str:
    payload_str = json.dumps(payload, sort_keys=True)
    signature = hmac.new(
        settings.QR_SECRET_KEY.encode(),
        payload_str.encode(),
        hashlib.sha256,
    ).hexdigest()[:16]
    token = base64.urlsafe_b64encode(f"{payload_str}|{signature}".encode()).decode()
    return token


def verify_qr_token(token: str) -> Optional[dict]:
    try:
        decoded = base64.urlsafe_b64decode(token.encode()).decode()
        payload_str, signature = decoded.rsplit("|", 1)
        expected = hmac.new(
            settings.QR_SECRET_KEY.encode(),
            payload_str.encode(),
            hashlib.sha256,
        ).hexdigest()[:16]
        if hmac.compare_digest(signature, expected):
            return json.loads(payload_str)
        return None
    except Exception:
        return None


class QRGenerateRequest(BaseModel):
    entity_type: str
    entity_id: str
    lot_no: Optional[str] = None


class QRGenerateResponse(BaseModel):
    token: str
    qr_data: str


class QRScanRequest(BaseModel):
    token: str
    station: str
    scanned_by: str
    location: Optional[str] = None


class QRScanResponse(BaseModel):
    id: str
    entity_type: str
    entity_id: str
    station: str
    scanned_by: Optional[str] = None
    scanned_at: str
    valid: bool


@router.post("/qr/generate", response_model=QRGenerateResponse)
async def generate_qr(
    req: QRGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch", write=True)),
):
    payload = {
        "entity_type": req.entity_type,
        "entity_id": req.entity_id,
        "lot_no": req.lot_no or "",
        "generated_by": current_user.name,
    }
    token = sign_qr_payload(payload)
    qr_data = json.dumps({"token": token, "payload": payload})
    if req.entity_type == "lot" and req.lot_no:
        lot_result = await db.execute(select(Lot).where(Lot.lot_no == req.lot_no))
        lot = lot_result.scalar_one_or_none()
        if lot:
            lot.qr_token = token
            await db.flush()
    return QRGenerateResponse(token=token, qr_data=qr_data)


@router.post("/qr/scan", response_model=QRScanResponse)
async def scan_qr(
    req: QRScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    payload = verify_qr_token(req.token)
    if not payload:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or tampered QR code")
    scan = QRScan(
        token=req.token,
        entity_type=payload.get("entity_type", ""),
        entity_id=payload.get("entity_id", ""),
        station=req.station,
        scanned_by=req.scanned_by,
        location=req.location,
    )
    db.add(scan)
    await db.flush()
    return QRScanResponse(
        id=scan.id,
        entity_type=scan.entity_type,
        entity_id=scan.entity_id,
        station=scan.station,
        scanned_by=scan.scanned_by,
        scanned_at=scan.scanned_at.isoformat() if scan.scanned_at else "",
        valid=True,
    )


@router.post("/qr/verify")
async def verify_qr(
    req: QRScanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    payload = verify_qr_token(req.token)
    if not payload:
        return {"valid": False, "message": "Invalid QR code"}
    scan_history = await db.execute(
        select(QRScan).where(QRScan.token == req.token).order_by(QRScan.scanned_at.desc())
    )
    scans = scan_history.scalars().all()
    return {
        "valid": True,
        "payload": payload,
        "scan_history": [
            {"station": s.station, "scanned_by": s.scanned_by, "scanned_at": s.scanned_at.isoformat() if s.scanned_at else ""}
            for s in scans
        ],
    }


@router.get("/qr/history/{entity_type}/{entity_id}")
async def get_qr_history(
    entity_type: str,
    entity_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_module("dispatch")),
):
    result = await db.execute(
        select(QRScan).where(QRScan.entity_type == entity_type, QRScan.entity_id == entity_id)
        .order_by(QRScan.scanned_at.asc())
    )
    scans = result.scalars().all()
    return [
        {"station": s.station, "scanned_by": s.scanned_by, "scanned_at": s.scanned_at.isoformat() if s.scanned_at else "", "location": s.location}
        for s in scans
    ]

import hmac
import hashlib
import json
import base64
from uuid import uuid4
from typing import Optional
from datetime import datetime, timezone
from app.core.config import settings
from app.core.error_handler import SpinFlowException, ErrorCode


def generate_qr_payload(
    bag_id: str,
    lot_id: str,
    lot_no: str,
    bag_no: str,
    yarn_count: str,
    weight_kg: float,
    mill_id: str,
    warehouse_id: str,
    destination_route_id: Optional[str] = None,
) -> str:
    payload = {
        "v": 1,
        "bag_id": bag_id,
        "lot_id": lot_id,
        "lot_no": lot_no,
        "bag_no": bag_no,
        "yarn_count": yarn_count,
        "weight_kg": weight_kg,
        "mill_id": mill_id,
        "warehouse_id": warehouse_id,
        "destination_route_id": destination_route_id,
        "issued_at": datetime.now(timezone.utc).isoformat(),
        "nonce": uuid4().hex[:8],
    }
    message = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = hmac.new(
        settings.QR_SECRET_KEY.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    result = base64.urlsafe_b64encode(
        json.dumps({"p": payload, "s": sig}).encode()
    ).decode()
    return result


def verify_qr_payload(qr_string: str) -> dict:  # type: ignore[type-arg]
    try:
        decoded = json.loads(base64.urlsafe_b64decode(qr_string.encode()))
    except (Exception, base64.binascii.Error):
        raise SpinFlowException.bad_request(
            "QR code invalid format", ErrorCode.QR_SIGNATURE_INVALID
        )
    payload = decoded.get("p")
    sig = decoded.get("s")
    if not payload or not sig:
        raise SpinFlowException.bad_request(
            "QR code structure invalid", ErrorCode.QR_SIGNATURE_INVALID
        )
    message = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    expected = hmac.new(
        settings.QR_SECRET_KEY.encode(), message.encode(), hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise SpinFlowException.bad_request(
            "QR code signature invalid — possible tampering detected",
            ErrorCode.QR_SIGNATURE_INVALID,
        )
    issued_at_str = payload.get("issued_at")
    if issued_at_str:
        try:
            issued_at = datetime.fromisoformat(issued_at_str)
            if (datetime.now(timezone.utc) - issued_at).days > 365:
                raise SpinFlowException.bad_request(
                    "QR code expired", ErrorCode.QR_EXPIRED
                )
        except ValueError:
            pass
    return payload

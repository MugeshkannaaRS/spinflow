import json
import base64
import pytest
from unittest.mock import patch
from app.core.qr_signing import generate_qr_payload, verify_qr_payload
from app.core.error_handler import SpinFlowException, ErrorCode


class TestQRSigning:
    def test_generate_and_verify_roundtrip(self):
        qr = generate_qr_payload(
            bag_id="bag-1",
            lot_id="lot-1",
            lot_no="LOT-001",
            bag_no="BAG-001",
            yarn_count="20s",
            weight_kg=23.5,
            mill_id="m1",
            warehouse_id="wh-1",
            destination_route_id="route-a",
        )
        payload = verify_qr_payload(qr)
        assert payload["bag_id"] == "bag-1"
        assert payload["lot_no"] == "LOT-001"
        assert payload["bag_no"] == "BAG-001"
        assert payload["yarn_count"] == "20s"
        assert payload["weight_kg"] == 23.5
        assert payload["mill_id"] == "m1"
        assert payload["destination_route_id"] == "route-a"
        assert payload["v"] == 1

    def test_verify_detects_tampering(self):
        qr = generate_qr_payload(
            bag_id="bag-1", lot_id="lot-1", lot_no="LOT-001",
            bag_no="BAG-001", yarn_count="20s", weight_kg=23.5,
            mill_id="m1", warehouse_id="wh-1",
        )
        decoded = json.loads(base64.urlsafe_b64decode(qr.encode()))
        decoded["p"]["bag_no"] = "TAMPERED-BAG"
        tampered_qr = base64.urlsafe_b64encode(
            json.dumps(decoded).encode()
        ).decode()

        with pytest.raises(SpinFlowException) as exc:
            verify_qr_payload(tampered_qr)
        assert exc.value.code == ErrorCode.QR_SIGNATURE_INVALID

    def test_verify_detects_wrong_secret(self):
        qr = generate_qr_payload(
            bag_id="bag-1", lot_id="lot-1", lot_no="LOT-001",
            bag_no="BAG-001", yarn_count="20s", weight_kg=23.5,
            mill_id="m1", warehouse_id="wh-1",
        )
        with patch("app.core.qr_signing.settings") as mock_settings:
            mock_settings.QR_SECRET_KEY = "different-secret"
            with pytest.raises(SpinFlowException) as exc:
                verify_qr_payload(qr)
            assert exc.value.code == ErrorCode.QR_SIGNATURE_INVALID

    def test_nonce_makes_each_qr_unique(self):
        qr1 = generate_qr_payload(
            bag_id="bag-1", lot_id="lot-1", lot_no="LOT-001",
            bag_no="BAG-001", yarn_count="20s", weight_kg=23.5,
            mill_id="m1", warehouse_id="wh-1",
        )
        qr2 = generate_qr_payload(
            bag_id="bag-1", lot_id="lot-1", lot_no="LOT-001",
            bag_no="BAG-001", yarn_count="20s", weight_kg=23.5,
            mill_id="m1", warehouse_id="wh-1",
        )
        assert qr1 != qr2

    def test_payload_contains_required_fields(self):
        qr = generate_qr_payload(
            bag_id="bag-1", lot_id="lot-1", lot_no="LOT-001",
            bag_no="BAG-001", yarn_count="20s", weight_kg=23.5,
            mill_id="m1", warehouse_id="wh-1",
        )
        payload = verify_qr_payload(qr)
        required = ["v", "bag_id", "lot_id", "lot_no", "bag_no", "yarn_count",
                     "weight_kg", "mill_id", "warehouse_id", "issued_at", "nonce"]
        for key in required:
            assert key in payload, f"Missing required key: {key}"

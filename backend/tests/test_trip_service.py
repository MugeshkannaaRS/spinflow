import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.error_handler import SpinFlowException, ErrorCode
from app.models.inventory import InventoryBag
from app.services.trip_service import TripService
from app.core.qr_signing import verify_qr_payload


class TestCreateTrip:
    async def test_create_trip_generates_signed_qr_per_bag(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:3]]
        result = await trip_service.create_trip(
            mill_id="m1",
            from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=3,
            planned_weight_kg=70.0,
            bag_ids=bag_ids,
            creator_id=trip_service.current_user.id,
            creator_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        assert len(trip.items) == 3
        for item in trip.items:
            assert item.qr_code is not None
            payload = verify_qr_payload(item.qr_code)
            assert payload is not None

    async def test_start_loading_changes_status(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:2]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=2, planned_weight_kg=50.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        start_result = await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        assert start_result["status"] == "loading"


class TestLoaderScan:
    async def test_loader_scan_success_marks_item_loaded(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:2]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=2, planned_weight_kg=50.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        qr = trip.items[0].qr_code
        scan = await trip_service.process_loader_scan(
            result["id"], qr,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        assert scan["result"] == "success"
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.items[0].item_status == "loaded"
        assert trip.loaded_bags == 1

    async def test_loader_scan_invalid_signature_rejected(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:1]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        with pytest.raises(SpinFlowException) as exc:
            await trip_service.process_loader_scan(
                result["id"], "FAKE_QR_STRING",
                scanner_id=trip_service.current_user.id, scanner_role="TEST",
            )
        assert exc.value.code in (ErrorCode.QR_SIGNATURE_INVALID,)

    async def test_loader_scan_wrong_trip_item_returns_not_found(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids1 = [sample_bags[0].id]
        bag_ids2 = [sample_bags[1].id, sample_bags[2].id]
        r1 = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids1,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        r2 = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids2,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            r1["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        await trip_service.start_loading(
            r2["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip1 = await trip_service.get_trip_detail(r1["id"])
        qr_from_trip1 = trip1.items[0].qr_code
        scan = await trip_service.process_loader_scan(
            r2["id"], qr_from_trip1,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        assert scan["result"] == "not_found"

    async def test_duplicate_loader_scan_returns_already_scanned(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:2]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=2, planned_weight_kg=50.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        qr = trip.items[0].qr_code
        scan1 = await trip_service.process_loader_scan(
            result["id"], qr,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        assert scan1["result"] == "success"
        scan2 = await trip_service.process_loader_scan(
            result["id"], qr,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        assert scan2["result"] == "already_scanned"

    async def test_full_loading_completes_trip_to_loaded(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:2]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=2, planned_weight_kg=50.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        for item in trip.items:
            await trip_service.process_loader_scan(
                result["id"], item.qr_code,
                scanner_id=trip_service.current_user.id, scanner_role="TEST",
            )
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.status == "loaded"


class TestReceiverScan:
    async def test_receiver_scan_success_marks_item_delivered(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:1]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        await trip_service.process_loader_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        await trip_service.depart_trip(
            result["id"], user_id=trip_service.current_user.id, user_role="TEST",
        )
        scan = await trip_service.process_receiver_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        assert scan["result"] == "success"
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.items[0].item_status == "delivered"
        assert trip.delivered_bags == 1

    async def test_wrong_destination_detection(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:1]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids,
            destination_route_id="route-A",
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        await trip_service.process_loader_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        await trip_service.depart_trip(
            result["id"], user_id=trip_service.current_user.id, user_role="TEST",
        )
        scan = await trip_service.process_receiver_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
            scanned_route_id="route-B",
        )
        assert scan["result"] == "wrong_destination"
        assert scan["alert"] is not None
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.items[0].wrong_destination_detected is True

    async def test_full_delivery_sets_trip_arrived(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:2]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=2, planned_weight_kg=50.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        for item in trip.items:
            await trip_service.process_loader_scan(
                result["id"], item.qr_code,
                scanner_id=trip_service.current_user.id, scanner_role="TEST",
            )
        await trip_service.depart_trip(
            result["id"], user_id=trip_service.current_user.id, user_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        for item in trip.items:
            await trip_service.process_receiver_scan(
                result["id"], item.qr_code,
                scanner_id=trip_service.current_user.id, scanner_role="TEST",
            )
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.status == "arrived"


class TestConfirmPOD:
    async def test_confirm_pod_sets_delivered(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:1]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        await trip_service.start_loading(
            result["id"], loader_id=trip_service.current_user.id, loader_role="TEST",
        )
        trip = await trip_service.get_trip_detail(result["id"])
        await trip_service.process_loader_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        await trip_service.depart_trip(
            result["id"], user_id=trip_service.current_user.id, user_role="TEST",
        )
        await trip_service.process_receiver_scan(
            result["id"], trip.items[0].qr_code,
            scanner_id=trip_service.current_user.id, scanner_role="TEST",
        )
        pod = await trip_service.confirm_pod(
            result["id"], confirmer_id=trip_service.current_user.id, confirmer_role="TEST",
        )
        assert pod["status"] == "delivered"
        trip = await trip_service.get_trip_detail(result["id"])
        assert trip.pod_confirmed_at is not None

    async def test_confirm_pod_requires_arrived_status(
        self, session: AsyncSession, trip_service: TripService, sample_bags: list[InventoryBag],
    ):
        bag_ids = [b.id for b in sample_bags[:1]]
        result = await trip_service.create_trip(
            mill_id="m1", from_warehouse_id=sample_bags[0].warehouse_id,
            planned_bags=1, planned_weight_kg=25.0, bag_ids=bag_ids,
            creator_id=trip_service.current_user.id, creator_role="TEST",
        )
        with pytest.raises(SpinFlowException) as exc:
            await trip_service.confirm_pod(
                result["id"], confirmer_id=trip_service.current_user.id, confirmer_role="TEST",
            )
        assert exc.value.status_code == 400

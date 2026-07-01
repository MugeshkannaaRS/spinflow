import pytest
from app.core.error_handler import SpinFlowException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.dispatch import Dispatch
from app.models.inventory import Lot
from app.services.dispatch_service import DispatchService
from app.services.stock_service import StockLedgerService


class TestCreateDispatch:
    async def test_create_dispatch_success(self, session: AsyncSession, dispatch_manager_user: "User"):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(
            date="2026-05-21",
            customer="Test Customer",
            quantity_kg=1000.0,
        )
        assert d.id is not None
        assert d.dispatch_no.startswith("DSP-")
        assert d.status == "pending"

    async def test_create_dispatch_raises_404_for_invalid_vehicle(self, session: AsyncSession, dispatch_manager_user: "User"):
        svc = DispatchService(session, dispatch_manager_user)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_dispatch(
                date="2026-05-21",
                customer="Test Customer",
                quantity_kg=1000.0,
                vehicle_no="NONEXISTENT",
            )
        assert exc.value.status_code == 404


class TestAddItem:
    async def test_add_item_success(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        item = await svc.add_item(d.id, approved_lot.lot_no, 500.0, 50)
        assert item.id is not None
        assert item.package_count == 50

        result = await session.execute(select(Dispatch).where(Dispatch.id == d.id))
        dispatch = result.scalar_one()
        assert dispatch.total_bags == 50
        assert dispatch.total_weight_kg == 500.0
        assert dispatch.status == "loading"

    async def test_add_item_raises_409_for_unapproved_lot(self, session: AsyncSession, dispatch_manager_user: "User", pending_lot: Lot):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        with pytest.raises(SpinFlowException) as exc:
            await svc.add_item(d.id, pending_lot.lot_no, 100.0, 10)
        assert exc.value.status_code == 409

    async def test_add_item_raises_400_when_bags_exceed_available(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        with pytest.raises(SpinFlowException) as exc:
            await svc.add_item(d.id, approved_lot.lot_no, 500.0, 999)
        assert exc.value.status_code == 400

    async def test_add_item_raises_400_when_dispatch_already_dispatched(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        stock_svc = StockLedgerService(session, dispatch_manager_user)
        await stock_svc.record_move(
            mill_id="m1", lot_id=approved_lot.id, warehouse_id=approved_lot.warehouse_id or "",
            move_type="PRODUCTION_IN", qty_in=approved_lot.total_bags or 0,
            weight_in_kg=approved_lot.quantity or 0, user_id=dispatch_manager_user.id,
            lot_no=approved_lot.lot_no,
        )

        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        item = await svc.add_item(d.id, approved_lot.lot_no, 500.0, 50)
        await svc.transition_status(d.id, "ready")
        d.eway_bill_no = "EWB12345"
        await session.flush()
        await svc.transition_status(d.id, "dispatched")

        with pytest.raises(SpinFlowException) as exc:
            await svc.add_item(d.id, approved_lot.lot_no, 100.0, 10)
        assert exc.value.status_code == 400


class TestTransitions:
    async def test_full_happy_path(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        stock_svc = StockLedgerService(session, dispatch_manager_user)
        await stock_svc.record_move(
            mill_id="m1", lot_id=approved_lot.id, warehouse_id=approved_lot.warehouse_id or "",
            move_type="PRODUCTION_IN", qty_in=approved_lot.total_bags or 0,
            weight_in_kg=approved_lot.quantity or 0, user_id=dispatch_manager_user.id,
            lot_no=approved_lot.lot_no,
        )

        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        assert d.status == "pending"

        await svc.add_item(d.id, approved_lot.lot_no, 500.0, 50)
        result = await session.execute(select(Dispatch).where(Dispatch.id == d.id))
        d = result.scalar_one()
        assert d.status == "loading"

        d2 = await svc.transition_status(d.id, "ready")
        assert d2.status == "ready"

        d2.eway_bill_no = "EWB12345"
        await session.flush()

        d3 = await svc.transition_status(d.id, "dispatched")
        assert d3.status == "dispatched"

    async def test_invalid_state_transition_raises_400(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        with pytest.raises(SpinFlowException) as exc:
            await svc.transition_status(d.id, "dispatched")
        assert exc.value.status_code == 400

    async def test_dispatch_without_eway_bill_raises_400(self, session: AsyncSession, dispatch_manager_user: "User", approved_lot: Lot):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        await svc.add_item(d.id, approved_lot.lot_no, 500.0, 50)
        await svc.transition_status(d.id, "ready")
        with pytest.raises(SpinFlowException) as exc:
            await svc.transition_status(d.id, "dispatched")
        assert exc.value.status_code == 400

    async def test_ready_without_items_raises_400(self, session: AsyncSession, dispatch_manager_user: "User"):
        svc = DispatchService(session, dispatch_manager_user)
        d = await svc.create_dispatch(date="2026-05-21", customer="Test", quantity_kg=1000.0)
        with pytest.raises(SpinFlowException) as exc:
            await svc.transition_status(d.id, "ready")
        assert exc.value.status_code == 400


class TestQRScan:
    async def test_qr_scan_unrecognised_code(self, session: AsyncSession, dispatch_manager_user: "User"):
        svc = DispatchService(session, dispatch_manager_user)
        result = await svc.process_qr_scan(
            token="UNKNOWN-CODE",
            station="gate-1",
        )
        assert result["status"] == "unrecognised"
        assert "warning" in result

    async def test_qr_scan_with_invalid_dispatch_id(self, session: AsyncSession, dispatch_manager_user: "User"):
        svc = DispatchService(session, dispatch_manager_user)
        with pytest.raises(SpinFlowException) as exc:
            await svc.get_dispatch("nonexistent-id")
        assert exc.value.status_code == 404

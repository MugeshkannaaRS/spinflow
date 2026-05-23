import uuid
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.error_handler import SpinFlowException
from app.services.stock_service import StockLedgerService
from app.services.sales_service import SalesOrderService
from app.models.stock import StockBalance, SalesOrder, SalesOrderLine
from app.models.inventory import Lot, Warehouse
from app.models.user import User


class TestRecordMove:
    async def test_record_move_production_in_creates_balance(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-TEST-001", type="yarn", quantity=2500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=50, quality_status="pending", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=50, weight_in_kg=2500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance is not None
        assert balance.qty_on_hand == 50
        assert balance.fg_state == "QC_PENDING"

    async def test_qc_approved_changes_state_not_qty(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-QC-001", type="yarn", quantity=2500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=50, quality_status="pending", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=50, weight_in_kg=2500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_on_hand == 50
        assert balance.fg_state == "SELLABLE"

    async def test_qc_rejected_moves_to_quarantine(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-REJ-001", type="yarn", quantity=2500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=50, quality_status="pending", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=50, weight_in_kg=2500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_REJECTED_TO_QUARANTINE", qty_out=50, weight_out_kg=2500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_on_hand == 0
        assert balance.qty_quarantine == 50
        assert balance.fg_state == "QUARANTINE"

    async def test_sales_reserved_reduces_available(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-SR-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="SALES_RESERVED", qty_in=30, weight_in_kg=1500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_on_hand == 100
        assert balance.qty_reserved == 30
        assert balance.qty_on_hand - balance.qty_reserved == 70

    async def test_dispatch_out_reduces_on_hand(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-DO-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="SALES_RESERVED", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="DISPATCH_OUT", qty_out=100, weight_out_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_on_hand == 0

    async def test_cannot_go_below_zero(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-NEG-001", type="yarn", quantity=500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=10, quality_status="pending", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=10, weight_in_kg=500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        with pytest.raises(SpinFlowException) as exc:
            await stock_service.record_move(
                mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
                move_type="DISPATCH_OUT", qty_out=20, weight_out_kg=1000.0,
                user_id=operator_user.id, lot_no=lot.lot_no,
            )
        assert exc.value.code.value == "INSUFFICIENT_STOCK"

    async def test_ledger_history_ordered_newest_first(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-HIST-001", type="yarn", quantity=1500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=30, quality_status="pending", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=30, weight_in_kg=1500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="SALES_RESERVED", qty_in=5, weight_in_kg=250.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )

        history = await stock_service.ledger_history(lot.id)
        assert len(history) == 3
        move_types = sorted(h["move_type"] for h in history)
        assert move_types == sorted(["PRODUCTION_IN", "QC_APPROVED", "SALES_RESERVED"])

    async def test_stock_snapshot_filters_by_state(
        self, session: AsyncSession, stock_service: StockLedgerService, warehouse: Warehouse, operator_user: User
    ):
        lot1 = Lot(id=str(uuid.uuid4()), lot_no="LOT-SNAP-1", type="yarn", quantity=1000.0, unit="kg",
                   mill_id="m1", warehouse_id=warehouse.id, total_bags=20, quality_status="pending", status="in-stock")
        lot2 = Lot(id=str(uuid.uuid4()), lot_no="LOT-SNAP-2", type="yarn", quantity=2000.0, unit="kg",
                   mill_id="m1", warehouse_id=warehouse.id, total_bags=40, quality_status="approved", status="in-stock")
        session.add(lot1)
        session.add(lot2)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot1.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=20, weight_in_kg=1000.0,
            user_id=operator_user.id, lot_no=lot1.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot2.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=40, weight_in_kg=2000.0,
            user_id=operator_user.id, lot_no=lot2.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot2.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot2.lot_no,
        )

        snapshot = await stock_service.stock_snapshot(mill_id="m1", fg_state="SELLABLE")
        assert len(snapshot) == 1
        assert snapshot[0]["lot_no"] == "LOT-SNAP-2"

        snapshot_all = await stock_service.stock_snapshot(mill_id="m1")
        assert len(snapshot_all) == 2

    async def test_get_available_returns_zero_for_no_balance(
        self, stock_service: StockLedgerService,
    ):
        available = await stock_service.get_available("nonexistent-lot", "nonexistent-wh")
        assert available == 0.0


class TestSalesOrder:
    async def test_create_sales_order_draft_no_reservation(
        self, session: AsyncSession, sales_service: SalesOrderService, stock_service: StockLedgerService,
        warehouse: Warehouse, operator_user: User,
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-SO-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        result = await sales_service.create_order(
            mill_id="m1", customer_id="c1", order_date="2026-05-22",
            lines=[{"lot_id": lot.id, "warehouse_id": warehouse.id, "bags_ordered": 20, "weight_kg": 1000.0}],
            creator_id=operator_user.id, creator_role="TEST",
        )
        assert result["status"] == "draft"

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_reserved == 0

    async def test_confirm_order_reserves_stock(
        self, session: AsyncSession, sales_service: SalesOrderService, stock_service: StockLedgerService,
        warehouse: Warehouse, operator_user: User, second_user: User,
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-SO2-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        # Create SO as operator_user, need a sales_service with operator_user
        result = await sales_service.create_order(
            mill_id="m1", customer_id="c1", order_date="2026-05-22",
            lines=[{"lot_id": lot.id, "warehouse_id": warehouse.id, "bags_ordered": 30, "weight_kg": 1500.0}],
            creator_id=operator_user.id, creator_role="TEST",
        )

        # Confirm with second_user (different user)
        sales_service2 = SalesOrderService(session, second_user)
        confirmed = await sales_service2.confirm_order(
            result["id"], confirmer_id=second_user.id, confirmer_role="TEST",
        )
        assert confirmed["status"] == "confirmed"

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_reserved == 30

    async def test_confirm_order_separation_of_duties(
        self, session: AsyncSession, sales_service: SalesOrderService, stock_service: StockLedgerService,
        warehouse: Warehouse, operator_user: User,
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-SOD-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        result = await sales_service.create_order(
            mill_id="m1", customer_id="c1", order_date="2026-05-22",
            lines=[{"lot_id": lot.id, "warehouse_id": warehouse.id, "bags_ordered": 30, "weight_kg": 1500.0}],
            creator_id=operator_user.id, creator_role="TEST",
        )

        with pytest.raises(SpinFlowException) as exc:
            await sales_service.confirm_order(
                result["id"], confirmer_id=operator_user.id, confirmer_role="TEST",
            )
        assert exc.value.status_code == 403

    async def test_confirm_order_insufficient_stock(
        self, session: AsyncSession, sales_service: SalesOrderService, stock_service: StockLedgerService,
        warehouse: Warehouse, operator_user: User, second_user: User,
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-IS-001", type="yarn", quantity=500.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=10, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=10, weight_in_kg=500.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        result = await sales_service.create_order(
            mill_id="m1", customer_id="c1", order_date="2026-05-22",
            lines=[{"lot_id": lot.id, "warehouse_id": warehouse.id, "bags_ordered": 50, "weight_kg": 2500.0}],
            creator_id=operator_user.id, creator_role="TEST",
        )

        sales_service2 = SalesOrderService(session, second_user)
        with pytest.raises(SpinFlowException) as exc:
            await sales_service2.confirm_order(
                result["id"], confirmer_id=second_user.id, confirmer_role="TEST",
            )
        assert exc.value.code.value == "INSUFFICIENT_STOCK"

    async def test_cancel_confirmed_order_releases_reservation(
        self, session: AsyncSession, sales_service: SalesOrderService, stock_service: StockLedgerService,
        warehouse: Warehouse, operator_user: User, second_user: User,
    ):
        lot = Lot(id=str(uuid.uuid4()), lot_no="LOT-CANCEL-001", type="yarn", quantity=5000.0, unit="kg",
                  mill_id="m1", warehouse_id=warehouse.id, total_bags=100, quality_status="approved", status="in-stock")
        session.add(lot)
        await session.flush()

        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="PRODUCTION_IN", qty_in=100, weight_in_kg=5000.0,
            user_id=operator_user.id, lot_no=lot.lot_no,
        )
        await stock_service.record_move(
            mill_id="m1", lot_id=lot.id, warehouse_id=warehouse.id,
            move_type="QC_APPROVED", user_id=operator_user.id, lot_no=lot.lot_no,
        )

        result = await sales_service.create_order(
            mill_id="m1", customer_id="c1", order_date="2026-05-22",
            lines=[{"lot_id": lot.id, "warehouse_id": warehouse.id, "bags_ordered": 40, "weight_kg": 2000.0}],
            creator_id=operator_user.id, creator_role="TEST",
        )

        sales_service2 = SalesOrderService(session, second_user)
        await sales_service2.confirm_order(
            result["id"], confirmer_id=second_user.id, confirmer_role="TEST",
        )

        await sales_service.cancel_order(
            result["id"], canceller_id=operator_user.id, canceller_role="TEST", reason="Test cancel",
        )

        balance = await stock_service.get_balance(lot.id, warehouse.id)
        assert balance.qty_reserved == 0
        assert balance.fg_state == "SELLABLE"

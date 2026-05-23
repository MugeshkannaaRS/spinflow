import uuid
import pytest
from app.core.error_handler import SpinFlowException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.quality import QualityTest
from app.models.inventory import Lot
from app.services.quality_service import QualityService
from app.services.stock_service import StockLedgerService


class TestEvaluateResult:
    def test_inconclusive_with_no_data(self):
        svc = QualityService.__new__(QualityService)
        result = svc._evaluate_result(None)
        assert result == "inconclusive"

    def test_pass_for_good_csp_and_u_percent(self):
        svc = QualityService.__new__(QualityService)
        result = svc._evaluate_result("40s", csp_value=2600, u_percent=5.0)
        assert result == "pass"

    def test_fail_for_csp_below_40s_threshold(self):
        svc = QualityService.__new__(QualityService)
        result = svc._evaluate_result("40s", csp_value=2400, u_percent=5.0)
        assert result == "fail"

    def test_fail_for_high_u_percent(self):
        svc = QualityService.__new__(QualityService)
        result = svc._evaluate_result("40s", csp_value=2600, u_percent=11.0)
        assert result == "fail"


class TestCreateTest:
    async def test_create_test_success(self, session: AsyncSession, quality_manager_user: "User", pending_lot: Lot):
        svc = QualityService(session, quality_manager_user)
        test = await svc.create_test(
            date="2026-05-21",
            type="csp",
            result=2600.0,
            standard=2500.0,
            lot_id=pending_lot.id,
            lot_no=pending_lot.lot_no,
            csp=2600.0,
        )
        assert test.id is not None
        assert test.status == "pass"

    async def test_create_test_raises_404_for_missing_lot(self, session: AsyncSession, quality_manager_user: "User"):
        svc = QualityService(session, quality_manager_user)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_test(
                date="2026-05-21",
                type="csp",
                result=2600.0,
                standard=2500.0,
                lot_id="nonexistent-id",
            )
        assert exc.value.status_code == 404

    async def test_create_test_raises_409_for_approved_lot(self, session: AsyncSession, quality_manager_user: "User", approved_lot: Lot):
        svc = QualityService(session, quality_manager_user)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_test(
                date="2026-05-21",
                type="csp",
                result=2600.0,
                standard=2500.0,
                lot_id=approved_lot.id,
            )
        assert exc.value.status_code == 409


class TestApproveTest:
    async def test_approve_propagates_approved_to_lot(self, session: AsyncSession, quality_manager_user: "User", pending_lot: Lot):
        svc = QualityService(session, quality_manager_user)
        test = await svc.create_test(
            date="2026-05-21", type="csp", result=2600.0, standard=2500.0,
            lot_id=pending_lot.id, lot_no=pending_lot.lot_no, csp=2600.0,
        )
        approved = await svc.approve_test(test.id, "approved")
        assert approved.status == "approved"

        result = await session.execute(select(Lot).where(Lot.id == pending_lot.id))
        lot = result.scalar_one()
        assert lot.quality_status == "approved"

    async def test_approve_propagates_rejected_to_lot(self, session: AsyncSession, quality_manager_user: "User", pending_lot: Lot):
        stock_svc = StockLedgerService(session, quality_manager_user)
        await stock_svc.record_move(
            mill_id="m1", lot_id=pending_lot.id, warehouse_id=pending_lot.warehouse_id or "",
            move_type="PRODUCTION_IN", qty_in=pending_lot.total_bags or 0,
            weight_in_kg=pending_lot.quantity or 0, user_id=quality_manager_user.id,
            lot_no=pending_lot.lot_no,
        )

        svc = QualityService(session, quality_manager_user)
        test = await svc.create_test(
            date="2026-05-21", type="csp", result=2000.0, standard=2500.0,
            lot_id=pending_lot.id, lot_no=pending_lot.lot_no, csp=2000.0,
        )
        rejected = await svc.approve_test(test.id, "rejected")
        assert rejected.status == "rejected"

        result = await session.execute(select(Lot).where(Lot.id == pending_lot.id))
        lot = result.scalar_one()
        assert lot.quality_status == "rejected"

    async def test_double_approve_raises_400(self, session: AsyncSession, quality_manager_user: "User", pending_lot: Lot):
        svc = QualityService(session, quality_manager_user)
        test = await svc.create_test(
            date="2026-05-21", type="csp", result=2600.0, standard=2500.0,
            lot_id=pending_lot.id, lot_no=pending_lot.lot_no, csp=2600.0,
        )
        await svc.approve_test(test.id, "approved")
        with pytest.raises(SpinFlowException) as exc:
            await svc.approve_test(test.id, "approved")
        assert exc.value.status_code == 400

    async def test_invalid_result_value_raises_400(self, session: AsyncSession, quality_manager_user: "User", pending_lot: Lot):
        svc = QualityService(session, quality_manager_user)
        test = await svc.create_test(
            date="2026-05-21", type="csp", result=2600.0, standard=2500.0,
            lot_id=pending_lot.id, lot_no=pending_lot.lot_no, csp=2600.0,
        )
        with pytest.raises(SpinFlowException) as exc:
            await svc.approve_test(test.id, "invalid_value")
        assert exc.value.status_code == 400


class TestQualitySummary:
    async def test_quality_summary_returns_zeros_on_empty_db(self, session: AsyncSession, quality_manager_user: "User"):
        svc = QualityService(session, quality_manager_user)
        summary = await svc.quality_summary()
        assert summary["total_tests"] == 0
        assert summary["pass_rate"] == 0.0
        assert summary["approved_lots"] == 0

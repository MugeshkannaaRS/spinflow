import uuid
import pytest
from datetime import datetime, timezone
from app.core.error_handler import SpinFlowException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.production import ProductionEntry, Machine, DowntimeLog
from app.services.production_service import ProductionService
from app.schemas.production import ProductionEntryCreate


class TestCreateEntry:
    async def test_create_entry_success(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21",
            shift="A",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=450.0,
            waste_kg=10.0,
            count="40s",
        )
        entry = await svc.create_entry(req)
        assert entry.id is not None
        assert entry.status == "pending"
        assert entry.produced_kg == 450.0
        assert entry.waste_kg == 10.0

    async def test_create_entry_efficiency_correct(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21",
            shift="B",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=500.0,
        )
        entry = await svc.create_entry(req)
        assert entry.id is not None

    async def test_create_entry_rejects_waste_exceeds_production(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21",
            shift="A",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=100.0,
            waste_kg=150.0,
        )
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_entry(req)
        assert exc.value.status_code == 400
        assert "Waste cannot exceed production" in exc.value.message

    async def test_create_entry_rejects_zero_target(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate.model_construct(
            date="2026-05-21",
            shift="A",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=0,
        )
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_entry(req)
        assert exc.value.status_code == 400

    async def test_create_entry_rejects_duplicate(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21",
            shift="A",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=100.0,
        )
        await svc.create_entry(req)
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_entry(req)
        assert exc.value.status_code == 409
        assert "already exists" in exc.value.message.lower()

    async def test_create_entry_blocked_for_breakdown_machine(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        machine.current_status = "breakdown"
        await session.flush()

        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21",
            shift="A",
            machine_code=machine.code,
            department="spinning",
            operator="op1",
            produced_kg=100.0,
        )
        with pytest.raises(SpinFlowException) as exc:
            await svc.create_entry(req)
        assert exc.value.status_code == 409
        assert "breakdown" in exc.value.message.lower()


class TestApproveEntry:
    async def test_approve_entry_success(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21", shift="A", machine_code=machine.code,
            department="spinning", operator="op1", produced_kg=100.0,
        )
        entry = await svc.create_entry(req)

        approved = await svc.approve_entry(entry.id)
        assert approved.status == "approved"
        assert approved.approved_by == prod_manager_user.name

    async def test_double_approve_raises_400(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21", shift="A", machine_code=machine.code,
            department="spinning", operator="op1", produced_kg=100.0,
        )
        entry = await svc.create_entry(req)
        await svc.approve_entry(entry.id)
        with pytest.raises(SpinFlowException) as exc:
            await svc.approve_entry(entry.id)
        assert exc.value.status_code == 400


class TestDowntime:
    async def test_log_downtime_sets_breakdown(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        dt = await svc.log_downtime(
            machine_code=machine.code,
            reason="Belt snapped",
            started_at=datetime.now(timezone.utc),
        )
        assert dt.id is not None
        assert dt.resolved is False

        result = await session.execute(select(Machine).where(Machine.id == machine.id))
        m = result.scalar_one()
        assert m.current_status == "breakdown"

    async def test_duplicate_active_downtime_raises_409(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        await svc.log_downtime(
            machine_code=machine.code,
            reason="Belt snapped",
            started_at=datetime.now(timezone.utc),
        )
        with pytest.raises(SpinFlowException) as exc:
            await svc.log_downtime(
                machine_code=machine.code,
                reason="Another issue",
                started_at=datetime.now(timezone.utc),
            )
        assert exc.value.status_code == 409

    async def test_resolve_downtime_restores_running(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        from datetime import timedelta
        svc = ProductionService(session, prod_manager_user)
        dt = await svc.log_downtime(
            machine_code=machine.code,
            reason="Belt snapped",
            started_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        )
        resolved = await svc.resolve_downtime(dt.id)
        assert resolved.resolved is True
        assert resolved.duration_min > 0

        result = await session.execute(select(Machine).where(Machine.id == machine.id))
        m = result.scalar_one()
        assert m.current_status == "running"

    async def test_resolve_nonexistent_downtime_raises_404(self, session: AsyncSession, prod_manager_user: "User"):
        svc = ProductionService(session, prod_manager_user)
        with pytest.raises(SpinFlowException) as exc:
            await svc.resolve_downtime("nonexistent-id")
        assert exc.value.status_code == 404


class TestDashboardSummary:
    async def test_dashboard_summary_zeros_on_empty_db(self, session: AsyncSession, prod_manager_user: "User"):
        svc = ProductionService(session, prod_manager_user)
        summary = await svc.dashboard_summary()
        assert summary["production_kg"] == 0.0
        assert summary["waste_kg"] == 0.0
        assert summary["active_downtime_count"] == 0

    async def test_dashboard_summary_with_data(self, session: AsyncSession, prod_manager_user: "User", machine: Machine):
        svc = ProductionService(session, prod_manager_user)
        req = ProductionEntryCreate(
            date="2026-05-21", shift="A", machine_code=machine.code,
            department="spinning", operator="op1", produced_kg=400.0, waste_kg=5.0,
        )
        await svc.create_entry(req)
        req2 = ProductionEntryCreate(
            date="2026-05-21", shift="B", machine_code=machine.code,
            department="spinning", operator="op2", produced_kg=450.0, waste_kg=3.0,
        )
        await svc.create_entry(req2)

        summary = await svc.dashboard_summary()
        assert summary["production_kg"] == 850.0
        assert summary["waste_kg"] == 8.0
        assert "spinning" in summary["department_wise"]
        assert summary["department_wise"]["spinning"] == 850.0

from typing import Optional, List
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, and_
from app.services.base import BaseService
from app.models.production import Machine, ProductionEntry, DowntimeLog
from app.schemas.production import ProductionEntryCreate, ProductionBulkCreate, ProductionBulkResponse
from app.core.error_handler import SpinFlowException, ErrorCode


class ProductionService(BaseService):
    async def list_entries(
        self,
        date: Optional[str] = None,
        shift: Optional[str] = None,
        department: Optional[str] = None,
        machine: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        stmt = select(ProductionEntry).order_by(ProductionEntry.created_at.desc())

        role_code = self.current_user.role_rel.code if self.current_user.role_rel else ""
        if role_code == "MACHINE_OPERATOR":
            stmt = stmt.where(ProductionEntry.operator == self.current_user.name)

        if date:
            stmt = stmt.where(ProductionEntry.date == date)
        if shift:
            stmt = stmt.where(ProductionEntry.shift == shift)
        if department:
            stmt = stmt.where(ProductionEntry.department == department)
        if machine:
            stmt = stmt.where(ProductionEntry.machine_code == machine)
        if status:
            stmt = stmt.where(ProductionEntry.status == status)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": items,
        }

    async def create_entry(self, req: ProductionEntryCreate) -> ProductionEntry:
        if req.waste_kg > req.produced_kg:
            raise SpinFlowException.bad_request(
                "Waste cannot exceed production",
                ErrorCode.INVALID_VALUE,
            )

        if req.produced_kg <= 0:
            raise SpinFlowException.bad_request(
                "Target must be > 0",
                ErrorCode.INVALID_VALUE,
            )

        machine_result = await self.db.execute(
            select(Machine).where(Machine.code == req.machine_code)
        )
        machine = machine_result.scalar_one_or_none()
        if not machine:
            raise SpinFlowException.not_found("Machine")

        if machine.current_status == "breakdown":
            raise SpinFlowException.conflict(
                "Cannot create entry for machine in breakdown status",
                ErrorCode.MACHINE_IN_BREAKDOWN,
            )

        dup_result = await self.db.execute(
            select(ProductionEntry).where(
                and_(
                    ProductionEntry.machine_code == req.machine_code,
                    ProductionEntry.shift == req.shift,
                    ProductionEntry.date == req.date,
                )
            )
        )
        existing = dup_result.scalar_one_or_none()
        if existing:
            raise SpinFlowException.conflict(
                "Entry already exists for this machine, shift, and date",
                ErrorCode.DUPLICATE_ENTRY,
            )

        entry = ProductionEntry(
            date=req.date,
            shift=req.shift,
            machine_code=req.machine_code,
            department=req.department,
            operator=req.operator,
            produced_kg=req.produced_kg,
            waste_kg=req.waste_kg,
            count=req.count,
            status="approved",
            entered_by=self.current_user.name,
            approved_by=self.current_user.name,
            approved_at=datetime.now(timezone.utc),
        )
        self.db.add(entry)
        await self.db.flush()

        await self._audit(
            action="create",
            entity="ProductionEntry",
            entity_id=entry.id,
            details=f"Created production entry: {entry.produced_kg}kg on {entry.machine_code}",
        )
        return entry

    async def create_entries_bulk(self, req: ProductionBulkCreate) -> ProductionBulkResponse:
        created = 0
        skipped = 0
        errors: List[str] = []

        active_items = [i for i in req.entries if i.produced_kg > 0]

        for item in active_items:
            try:
                machine_result = await self.db.execute(
                    select(Machine).where(Machine.code == item.machine_code)
                )
                machine = machine_result.scalar_one_or_none()
                if not machine:
                    errors.append(f"{item.machine_code}: machine not found")
                    skipped += 1
                    continue

                dup_result = await self.db.execute(
                    select(ProductionEntry).where(
                        and_(
                            ProductionEntry.machine_code == item.machine_code,
                            ProductionEntry.shift == req.shift,
                            ProductionEntry.date == req.date,
                        )
                    )
                )
                if dup_result.scalar_one_or_none():
                    errors.append(f"{item.machine_code}: entry already exists for this shift")
                    skipped += 1
                    continue

                if item.waste_kg > item.produced_kg:
                    errors.append(f"{item.machine_code}: waste exceeds production")
                    skipped += 1
                    continue

                entry = ProductionEntry(
                    date=req.date,
                    shift=req.shift,
                    machine_code=item.machine_code,
                    department=req.department,
                    operator=item.operator,
                    produced_kg=item.produced_kg,
                    waste_kg=item.waste_kg,
                    count=item.count,
                    status="approved",
                    entered_by=self.current_user.name,
                )
                self.db.add(entry)
                await self.db.flush()

                if item.machine_status and item.machine_status != machine.current_status:
                    machine.current_status = item.machine_status

                if item.stoppage_mins > 0:
                    reason = item.stoppage_reason or "Stoppage logged via bulk entry"
                    log = DowntimeLog(
                        machine_code=item.machine_code,
                        reason=reason,
                        started_at=datetime.now(timezone.utc),
                        duration_min=item.stoppage_mins,
                        resolved=True,
                        reported_by=self.current_user.name,
                    )
                    self.db.add(log)

                await self._audit(
                    action="create",
                    entity="ProductionEntry",
                    entity_id=entry.id,
                    details=f"Bulk entry: {entry.produced_kg}kg on {entry.machine_code}",
                )
                created += 1
            except Exception as exc:
                errors.append(f"{item.machine_code}: {str(exc)}")
                skipped += 1

        await self.db.commit()
        return ProductionBulkResponse(created=created, skipped=skipped, errors=errors)

    async def approve_entry(self, entry_id: str) -> ProductionEntry:
        entry = await self.get_or_404(ProductionEntry, entry_id)

        # already approved — just return without error (idempotent)
        if entry.status == "approved":
            return entry

        entry.status = "approved"
        entry.approved_by = self.current_user.name
        entry.approved_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="approve",
            entity="ProductionEntry",
            entity_id=entry.id,
            details=f"Approved production entry: {entry.produced_kg}kg on {entry.machine_code}",
            old_value="pending",
            new_value="approved",
        )
        return entry

    async def reject_entry(self, entry_id: str) -> ProductionEntry:
        entry = await self.get_or_404(ProductionEntry, entry_id)

        if entry.status == "rejected":
            raise SpinFlowException.bad_request(
                "Entry is already rejected",
                ErrorCode.CONFLICT,
            )

        entry.status = "rejected"
        entry.approved_by = self.current_user.name
        entry.approved_at = datetime.now(timezone.utc)
        await self.db.flush()

        await self._audit(
            action="reject",
            entity="ProductionEntry",
            entity_id=entry.id,
            details=f"Rejected production entry: {entry.produced_kg}kg on {entry.machine_code}",
            old_value="pending",
            new_value="rejected",
        )
        return entry

    async def list_downtime(self, page: int = 1, page_size: int = 20) -> dict:
        stmt = select(DowntimeLog).order_by(DowntimeLog.started_at.desc())
        count_stmt = select(func.count()).select_from(select(DowntimeLog).subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": items,
        }

    async def list_machines(self, page: int = 1, page_size: int = 20) -> dict:
        stmt = select(Machine)
        count_stmt = select(func.count()).select_from(select(Machine).subquery())
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        items = list(result.scalars().all())
        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
            "data": items,
        }

    async def update_machine(self, machine_id: str, data: dict) -> Machine:
        machine = await self.get_or_404(Machine, machine_id)
        for key, value in data.items():
            if hasattr(machine, key) and value is not None:
                setattr(machine, key, value)
        await self.db.flush()
        await self._audit(
            action="update",
            entity="Machine",
            entity_id=machine.id,
            details=f"Machine {machine.code} updated",
            old_value=None,
            new_value=data,
        )
        return machine

    async def update_machine_status(self, machine_id: str, current_status: str) -> Machine:
        machine = await self.get_or_404(Machine, machine_id)
        old_status = machine.current_status
        machine.current_status = current_status
        await self.db.flush()

        await self._audit(
            action="update_status",
            entity="Machine",
            entity_id=machine.id,
            details=f"Machine {machine.code} status changed from {old_status} to {current_status}",
            old_value=old_status,
            new_value=current_status,
        )
        return machine

    async def log_downtime(
        self, machine_code: str, reason: str, started_at: datetime,
        reported_by: Optional[str] = None,
    ) -> DowntimeLog:
        machine_result = await self.db.execute(
            select(Machine).where(Machine.code == machine_code)
        )
        machine = machine_result.scalar_one_or_none()
        if not machine:
            raise SpinFlowException.not_found("Machine")

        active_result = await self.db.execute(
            select(DowntimeLog).where(
                and_(
                    DowntimeLog.machine_code == machine_code,
                    DowntimeLog.resolved == False,
                )
            )
        )
        active = active_result.scalar_one_or_none()
        if active:
            raise SpinFlowException.conflict(
                "Machine already has active downtime",
                ErrorCode.CONFLICT,
            )

        log = DowntimeLog(
            machine_code=machine_code,
            reason=reason,
            started_at=started_at,
            duration_min=0,
            resolved=False,
            reported_by=reported_by or self.current_user.name,
        )
        self.db.add(log)
        machine.current_status = "breakdown"
        await self.db.flush()

        await self._audit(
            action="log_downtime",
            entity="DowntimeLog",
            entity_id=log.id,
            details=f"Downtime logged for machine {machine_code}: {reason}",
        )
        return log

    async def resolve_downtime(self, downtime_id: str) -> DowntimeLog:
        log = await self.get_or_404(DowntimeLog, downtime_id)

        if log.resolved:
            raise SpinFlowException.bad_request(
                "Downtime is already resolved",
                ErrorCode.CONFLICT,
            )

        log.ended_at = datetime.now(timezone.utc)
        duration = (log.ended_at - log.started_at).total_seconds() / 60
        log.duration_min = int(duration)
        log.resolved = True

        machine_result = await self.db.execute(
            select(Machine).where(Machine.code == log.machine_code)
        )
        machine = machine_result.scalar_one_or_none()
        if machine:
            machine.current_status = "running"

        await self.db.flush()

        await self._audit(
            action="resolve_downtime",
            entity="DowntimeLog",
            entity_id=log.id,
            details=f"Downtime resolved for machine {log.machine_code}, duration: {log.duration_min}min",
        )
        return log

    async def dashboard_summary(self) -> dict:
        prod_result = await self.db.execute(
            select(
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0),
                func.coalesce(func.sum(ProductionEntry.waste_kg), 0),
            )
        )
        row = prod_result.one()
        total_production = float(row[0])
        total_waste = float(row[1])

        machine_count_result = await self.db.execute(select(func.count(Machine.id)))
        total_machines = machine_count_result.scalar() or 0

        breakdown_result = await self.db.execute(
            select(func.count(DowntimeLog.id)).where(DowntimeLog.resolved == False)
        )
        active_downtime = breakdown_result.scalar() or 0

        machine_status_result = await self.db.execute(
            select(Machine.current_status, func.count(Machine.id))
            .group_by(Machine.current_status)
        )
        machine_status_breakdown = {}
        for status, count in machine_status_result.all():
            machine_status_breakdown[status] = count

        dept_result = await self.db.execute(
            select(
                ProductionEntry.department,
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0),
            )
            .group_by(ProductionEntry.department)
        )
        department_wise = {}
        for dept, kg in dept_result.all():
            department_wise[dept] = float(kg)

        machine_result = await self.db.execute(select(func.avg(Machine.target_kg)))
        avg_target = machine_result.scalar() or 1.0
        efficiency_pct = round((total_production / avg_target) * 100, 2) if avg_target > 0 else 0.0

        return {
            "production_kg": total_production,
            "waste_kg": total_waste,
            "efficiency_pct": efficiency_pct,
            "active_downtime_count": active_downtime,
            "machine_status_breakdown": machine_status_breakdown,
            "department_wise": department_wise,
            "total_machines": total_machines,
        }

    async def efficiency_trend(self, days: int = 7) -> list:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        since_str = since.strftime("%Y-%m-%d")

        result = await self.db.execute(
            select(
                ProductionEntry.date,
                func.coalesce(func.sum(ProductionEntry.produced_kg), 0),
            )
            .where(ProductionEntry.date >= since_str)
            .group_by(ProductionEntry.date)
            .order_by(ProductionEntry.date)
        )
        trend = []
        for date, kg in result.all():
            trend.append({"date": date, "production_kg": float(kg)})
        return trend

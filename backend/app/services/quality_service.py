from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, and_
from app.services.base import BaseService
from app.models.quality import QualityTest
from app.models.inventory import Lot
from app.core.error_handler import SpinFlowException, ErrorCode
from app.services.stock_service import StockLedgerService


CSP_THRESHOLDS: Dict[str, float] = {
    "10s": 1800,
    "20s": 2000,
    "30s": 2200,
    "40s": 2500,
    "60s": 2700,
    "80s": 2900,
}

U_PERCENT_MAX: Dict[str, float] = {
    "10s": 12.0,
    "20s": 11.0,
    "30s": 10.5,
    "40s": 10.0,
    "60s": 9.5,
    "80s": 9.0,
}


class QualityService(BaseService):
    CSP_THRESHOLDS = CSP_THRESHOLDS
    U_PERCENT_MAX = U_PERCENT_MAX

    def _evaluate_result(
        self,
        count: Optional[str],
        csp_value: Optional[float] = None,
        u_percent: Optional[float] = None,
    ) -> str:
        if csp_value is None and u_percent is None:
            return "inconclusive"

        if count:
            threshold = CSP_THRESHOLDS.get(count)
            max_u = U_PERCENT_MAX.get(count)

            if csp_value is not None and threshold is not None:
                if csp_value < threshold:
                    return "fail"

            if u_percent is not None and max_u is not None:
                if u_percent > max_u:
                    return "fail"

        if csp_value is not None:
            return "pass"

        return "inconclusive"

    async def list_tests(
        self,
        date: Optional[str] = None,
        lot_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        stmt = select(QualityTest).order_by(QualityTest.created_at.desc())

        if date:
            stmt = stmt.where(QualityTest.date == date)
        if lot_id:
            stmt = stmt.where(QualityTest.lot_id == lot_id)
        if status:
            stmt = stmt.where(QualityTest.status == status)

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

    async def create_test(
        self,
        date: str,
        type: str,
        result: float,
        standard: float,
        lot_id: Optional[str] = None,
        lot_no: Optional[str] = None,
        machine_code: Optional[str] = None,
        sample_ref: Optional[str] = None,
        unit: Optional[str] = None,
        tested_by: Optional[str] = None,
        u_percent: Optional[float] = None,
        csp: Optional[float] = None,
        mill_id: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> QualityTest:
        if lot_id:
            lot_result = await self.db.execute(select(Lot).where(Lot.id == lot_id))
            lot = lot_result.scalar_one_or_none()
            if not lot:
                raise SpinFlowException.not_found("Lot")
            if lot.quality_status == "approved":
                raise SpinFlowException.conflict(
                    "Cannot create test for already approved lot",
                    ErrorCode.QUALITY_NOT_APPROVED,
                )

        auto_status = self._evaluate_result(None, csp, u_percent)
        if auto_status == "inconclusive":
            auto_status = "pass" if result >= standard else "fail"

        test = QualityTest(
            date=date,
            type=type,
            lot_id=lot_id,
            lot_no=lot_no,
            machine_code=machine_code,
            sample_ref=sample_ref,
            result=result,
            unit=unit,
            standard=standard,
            u_percent=u_percent,
            csp=csp,
            mill_id=mill_id,
            company_id=company_id,
            status=auto_status,
            tested_by=tested_by or self.current_user.name,
        )
        self.db.add(test)
        await self.db.flush()
        await self.db.commit()

        await self._audit(
            action="create",
            entity="QualityTest",
            entity_id=test.id,
            details=f"Created quality test: {type} result={result}, status={auto_status}",
        )
        return test

    async def approve_test(self, test_id: str, result: str) -> QualityTest:
        if result not in ("approved", "rejected"):
            raise SpinFlowException.bad_request(
                "Result must be 'approved' or 'rejected'",
                ErrorCode.INVALID_VALUE,
            )

        test = await self.get_or_404(QualityTest, test_id)

        if test.status in ("approved", "rejected"):
            raise SpinFlowException.bad_request(
                "Test is already finalised",
                ErrorCode.CONFLICT,
            )

        old_status = test.status
        if result == "approved":
            test.status = "approved"
        else:
            test.status = "rejected"

        await self.db.flush()
        await self.db.commit()

        if test.lot_id:
            lot_result = await self.db.execute(select(Lot).where(Lot.id == test.lot_id))
            lot = lot_result.scalar_one_or_none()
            if lot:
                lot.quality_status = test.status
                await self.db.flush()
                await self.db.commit()

                stock_service = StockLedgerService(self.db, self.current_user)
                mill_id = self.current_user.mill_id or lot.mill_id or ""
                if result == "approved":
                    await stock_service.record_move(
                        move_type="QC_APPROVED",
                        lot_id=lot.id,
                        warehouse_id=lot.warehouse_id or "",
                        mill_id=mill_id,
                        ref_doc_type="quality_test",
                        ref_doc_id=test_id,
                        user_id=self.current_user.id,
                        lot_no=lot.lot_no,
                    )
                elif result == "rejected":
                    await stock_service.record_move(
                        move_type="QC_REJECTED_TO_QUARANTINE",
                        lot_id=lot.id,
                        warehouse_id=lot.warehouse_id or "",
                        mill_id=mill_id,
                        qty_out=lot.total_bags or 0,
                        weight_out_kg=lot.quantity or 0,
                        ref_doc_type="quality_test",
                        ref_doc_id=test_id,
                        user_id=self.current_user.id,
                        lot_no=lot.lot_no,
                    )

        await self._audit(
            action="approve_test",
            entity="QualityTest",
            entity_id=test.id,
            details=f"Quality test {result}: {test.type} on lot {test.lot_no}",
            old_value=old_status,
            new_value=test.status,
        )
        return test

    async def list_lots(self, page: int = 1, page_size: int = 20) -> dict:
        stmt = select(Lot).order_by(Lot.created_at.desc())
        count_stmt = select(func.count()).select_from(select(Lot).subquery())
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

    async def get_lot_tests(self, lot_id: str) -> List[QualityTest]:
        lot_result = await self.db.execute(select(Lot).where(Lot.id == lot_id))
        if not lot_result.scalar_one_or_none():
            raise SpinFlowException.not_found("Lot")

        result = await self.db.execute(
            select(QualityTest).where(QualityTest.lot_id == lot_id)
            .order_by(QualityTest.created_at.desc())
        )
        return list(result.scalars().all())

    async def quality_summary(self) -> dict:
        total_result = await self.db.execute(select(func.count(QualityTest.id)))
        total_tests = total_result.scalar() or 0

        pass_result = await self.db.execute(
            select(func.count(QualityTest.id)).where(QualityTest.status == "pass")
        )
        pass_count = pass_result.scalar() or 0

        fail_result = await self.db.execute(
            select(func.count(QualityTest.id)).where(QualityTest.status == "fail")
        )
        fail_count = fail_result.scalar() or 0

        approved_lots_result = await self.db.execute(
            select(func.count(Lot.id)).where(Lot.quality_status == "approved")
        )
        approved_lots = approved_lots_result.scalar() or 0

        return {
            "total_tests": total_tests,
            "pass_count": pass_count,
            "fail_count": fail_count,
            "pass_rate": round((pass_count / total_tests * 100), 2) if total_tests > 0 else 0.0,
            "approved_lots": approved_lots,
        }

    async def csp_trend(self, days: int = 7) -> list:
        since = datetime.now(timezone.utc) - timedelta(days=days)
        since_str = since.strftime("%Y-%m-%d")

        result = await self.db.execute(
            select(
                QualityTest.date,
                func.avg(QualityTest.result),
            )
            .where(
                and_(
                    QualityTest.date >= since_str,
                    QualityTest.type == "csp",
                )
            )
            .group_by(QualityTest.date)
            .order_by(QualityTest.date)
        )
        trend = []
        for date, avg_result in result.all():
            trend.append({"date": date, "avg_csp": round(float(avg_result), 2)})
        return trend

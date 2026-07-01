"""Wave 5 — Phase 2 Super Admin Command Center service.

Single aggregated KPI endpoint consolidating data from billing, stats,
users, and platform tracking into one response.
"""
import logging
from typing import Dict, List
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

from app.services.billing_service import BillingService

logger = logging.getLogger(__name__)


class CommandCenterService:
    """Provides aggregated KPI data for the Super Admin Command Center."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def kpi(self) -> Dict:
        """Return all 12+ KPI values in a single query batch."""
        bs = BillingService(self.db)
        summary = await bs.get_billing_summary()

        # Active sessions
        sessions_res = await self.db.execute(
            select(func.count()).select_from(text("user_sessions"))
            .where(text("is_active = true"))
        )
        active_sessions = sessions_res.scalar() or 0

        # Critical alerts count (open alerts with severity CRITICAL or EMERGENCY)
        alerts_res = await self.db.execute(
            select(func.count()).select_from(text("alert_events"))
            .where(text("status IN ('open', 'escalated') AND severity IN ('CRITICAL', 'EMERGENCY')"))
        )
        critical_alerts = alerts_res.scalar() or 0

        # Total storage (upload bytes from storage_usage)
        storage_res = await self.db.execute(
            select(func.coalesce(func.sum(text("upload_bytes")), 0)).select_from(text("storage_usage"))
        )
        total_storage_bytes = storage_res.scalar() or 0

        # API calls this month
        api_res = await self.db.execute(
            select(func.coalesce(func.sum(text("call_count")), 0)).select_from(text("api_usage"))
            .where(text("date >= date_trunc('month', CURRENT_TIMESTAMP)"))
        )
        api_calls_mtd = api_res.scalar() or 0

        return {
            "total_companies": summary.get("total_companies", 0),
            "total_mills": summary.get("total_mills", 0),
            "total_users": summary.get("total_users", 0),
            "active_users": summary.get("active_users", 0),
            "mrr": summary.get("mrr", 0),
            "arr": summary.get("arr", 0),
            "churn_rate": summary.get("churn_rate", 0),
            "revenue_growth": summary.get("revenue_growth", 0),
            "active_sessions": active_sessions,
            "critical_alerts": critical_alerts,
            "storage_bytes": total_storage_bytes,
            "storage_gb": round(total_storage_bytes / (1024**3), 2),
            "api_calls_mtd": api_calls_mtd,
            "collection_rate": summary.get("collection_rate", 0),
        }

    async def fastest_growing(self, limit: int = 10) -> List[Dict]:
        """Companies ranked by month-over-month revenue growth."""
        now = datetime.now(timezone.utc)
        current_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        if now.month == 1:
            prev_start = datetime(now.year - 1, 12, 1, tzinfo=timezone.utc)
            prev_end = current_start
        else:
            prev_start = datetime(now.year, now.month - 1, 1, tzinfo=timezone.utc)
            prev_end = current_start

        result = await self.db.execute(text("""
            WITH current_rev AS (
                SELECT company_id, SUM(amount) AS revenue
                FROM billing_invoices
                WHERE status = 'paid'
                  AND paid_at >= :cstart AND paid_at < :cend
                GROUP BY company_id
            ), previous_rev AS (
                SELECT company_id, SUM(amount) AS revenue
                FROM billing_invoices
                WHERE status = 'paid'
                  AND paid_at >= :pstart AND paid_at < :pend
                GROUP BY company_id
            )
            SELECT
                c.id, c.name, c.code,
                COALESCE(cr.revenue, 0) AS current_revenue,
                COALESCE(pr.revenue, 0) AS previous_revenue,
                CASE WHEN COALESCE(pr.revenue, 0) > 0
                     THEN ROUND(((COALESCE(cr.revenue, 0) - COALESCE(pr.revenue, 0)) / pr.revenue * 100)::numeric, 1)
                     ELSE 0
                END AS growth_pct
            FROM companies c
            LEFT JOIN current_rev cr ON cr.company_id = c.id
            LEFT JOIN previous_rev pr ON pr.company_id = c.id
            WHERE COALESCE(cr.revenue, 0) > 0 OR COALESCE(pr.revenue, 0) > 0
            ORDER BY growth_pct DESC
            LIMIT :lim
        """), {
            "cstart": current_start, "cend": now,
            "pstart": prev_start, "pend": prev_end,
            "lim": limit,
        })
        return [
            {
                "id": str(r.id),
                "name": r.name,
                "code": r.code,
                "current_revenue": float(r.current_revenue or 0),
                "previous_revenue": float(r.previous_revenue or 0),
                "growth_pct": float(r.growth_pct or 0),
            }
            for r in result.fetchall()
        ]

    async def active_mills(self, limit: int = 10) -> List[Dict]:
        """Mills ranked by recent production activity."""
        result = await self.db.execute(text("""
            SELECT m.id, m.code, m.name, m.company_id, c.name AS company_name,
                   (SELECT COUNT(*) FROM production_entries
                    WHERE mill_id = m.id AND entry_date >= CURRENT_DATE - 30) AS entries_30d
            FROM mills m
            JOIN companies c ON c.id = m.company_id
            WHERE m.is_active = true
            ORDER BY entries_30d DESC
            LIMIT :lim
        """), {"lim": limit})
        return [
            {
                "id": str(r.id),
                "code": r.code,
                "name": r.name,
                "company_id": str(r.company_id),
                "company_name": r.company_name,
                "entries_30d": r.entries_30d or 0,
            }
            for r in result.fetchall()
        ]

    async def inactive_customers(self, days: int = 30) -> List[Dict]:
        """Companies with no paid invoices in the last N days."""
        result = await self.db.execute(text("""
            SELECT c.id, c.name, c.code, c.status,
                   (SELECT MAX(paid_at) FROM billing_invoices
                    WHERE company_id = c.id AND status = 'paid') AS last_payment
            FROM companies c
            WHERE c.is_active = true
              AND (
                  SELECT MAX(paid_at) FROM billing_invoices
                  WHERE company_id = c.id AND status = 'paid'
              ) IS DISTINCT FROM NULL
              AND (
                  SELECT MAX(paid_at) FROM billing_invoices
                  WHERE company_id = c.id AND status = 'paid'
              ) < CURRENT_TIMESTAMP - :days * INTERVAL '1 day'
            ORDER BY last_payment ASC
        """), {"days": days})
        return [
            {
                "id": str(r.id),
                "name": r.name,
                "code": r.code,
                "status": r.status,
                "last_payment": r.last_payment.isoformat() if r.last_payment else None,
            }
            for r in result.fetchall()
        ]

    async def health_scores(self) -> List[Dict]:
        """Health scores for all companies, computed server-side."""
        now = datetime.now(timezone.utc)
        result = await self.db.execute(text("""
            SELECT
                c.id, c.name, c.code, c.status,
                cs.status AS sub_status,
                cs.overdue_status,
                cs.extra_users, cs.extra_mills, cs.extra_employees,
                (SELECT COUNT(*) FROM users WHERE company_id = c.id AND is_active = true AND deleted_at IS NULL) AS user_count,
                (SELECT COUNT(*) FROM mills WHERE company_id = c.id AND is_active = true) AS mill_count,
                COALESCE((SELECT MAX(paid_at) FROM billing_invoices WHERE company_id = c.id AND status = 'paid'), c.created_at) AS last_activity
            FROM companies c
            LEFT JOIN company_subscriptions cs ON cs.company_id = c.id
            WHERE c.is_active = true
        """))
        scores = []
        for r in result.fetchall():
            score = 100
            reasons = []

            if r.sub_status == "suspended":
                score -= 40
                reasons.append("suspended")
            elif r.sub_status == "expired":
                score -= 30
                reasons.append("expired")
            elif r.sub_status == "grace_period":
                score -= 20
                reasons.append("grace_period")
            elif r.overdue_status == "overdue":
                score -= 15
                reasons.append("overdue")

            if r.last_activity:
                days_inactive = (now - r.last_activity).days
                if days_inactive > 60:
                    score -= 15
                    reasons.append(f"{days_inactive}d inactive")
                elif days_inactive > 30:
                    score -= 5
                    reasons.append(f"{days_inactive}d inactive")

            scores.append({
                "company_id": str(r.id),
                "name": r.name,
                "code": r.code,
                "score": max(0, score),
                "status": r.status,
                "subscription_status": r.sub_status or "unknown",
                "overdue_status": r.overdue_status or "active",
                "user_count": r.user_count or 0,
                "mill_count": r.mill_count or 0,
                "reasons": reasons,
            })
        return scores

    async def upgrade_funnel(self) -> Dict:
        """Upgrade/downgrade request funnel metrics."""
        result = await self.db.execute(text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
                COUNT(*) FILTER (WHERE status = 'approved') AS approved_count,
                COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
                COUNT(*) FILTER (WHERE change_type = 'upgrade') AS upgrade_count,
                COUNT(*) FILTER (WHERE change_type = 'downgrade') AS downgrade_count,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(reviewed_at, CURRENT_TIMESTAMP) - created_at)))::numeric, 0) AS avg_review_seconds
            FROM subscription_change_requests
            WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '90 days'
        """))
        r = result.fetchone()
        total = (r.pending_count or 0) + (r.approved_count or 0) + (r.rejected_count or 0)
        return {
            "pending": r.pending_count or 0,
            "approved": r.approved_count or 0,
            "rejected": r.rejected_count or 0,
            "total_90d": total,
            "upgrades": r.upgrade_count or 0,
            "downgrades": r.downgrade_count or 0,
            "approval_rate": round((r.approved_count or 0) / total * 100, 1) if total > 0 else 0,
            "avg_review_hours": round((r.avg_review_seconds or 0) / 3600, 1),
        }

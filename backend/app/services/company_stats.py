import logging
from typing import Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

logger = logging.getLogger(__name__)


class CompanyStatsService:
    """Single source of truth for all company statistics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_company_stats(self, company_id: Optional[str] = None) -> List[Dict]:
        """Get accurate user and mill counts for every company (or one company).

        Returns list of dicts with:
            company_id, code, name, user_count, active_user_count, mill_count, active_mill_count
        """
        if company_id:
            result = await self.db.execute(text("""
                SELECT
                    c.id AS company_id,
                    c.code,
                    c.name,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true) AS active_user_count,
                    (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id) AS mill_count,
                    (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id AND m.is_active = true) AS active_mill_count
                FROM companies c
                WHERE c.id = :cid
            """), {"cid": company_id})
        else:
            result = await self.db.execute(text("""
                SELECT
                    c.id AS company_id,
                    c.code,
                    c.name,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS user_count,
                    (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true) AS active_user_count,
                    (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id) AS mill_count,
                    (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id AND m.is_active = true) AS active_mill_count
                FROM companies c
                ORDER BY c.name
            """))

        rows = result.fetchall()
        return [
            {
                "company_id": row.company_id,
                "code": row.code,
                "name": row.name,
                "user_count": row.user_count or 0,
                "active_user_count": row.active_user_count or 0,
                "mill_count": row.mill_count or 0,
                "active_mill_count": row.active_mill_count or 0,
            }
            for row in rows
        ]

    async def get_global_stats(self) -> Dict:
        """Get global summary stats for dashboard/admin hub."""
        result = await self.db.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM companies) AS total_companies,
                (SELECT COUNT(*) FROM companies WHERE is_active = true) AS active_companies,
                (SELECT COUNT(*) FROM mills) AS total_mills,
                (SELECT COUNT(*) FROM mills WHERE is_active = true) AS active_mills,
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM users WHERE is_active = true) AS active_users
        """))
        row = result.fetchone()
        return {
            "total_companies": row.total_companies or 0,
            "active_companies": row.active_companies or 0,
            "total_mills": row.total_mills or 0,
            "active_mills": row.active_mills or 0,
            "total_users": row.total_users or 0,
            "active_users": row.active_users or 0,
        }

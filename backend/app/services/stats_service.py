"""Centralized counting service — single source of truth for all entity counts.

Consistent filters:
  - Companies: is_active = true
  - Mills: is_active = true
  - Users: is_active = true AND deleted_at IS NULL
  - Employees: is_active = true
"""

import logging
from typing import Dict, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text

logger = logging.getLogger(__name__)


class StatsService:
    """Single source of truth for all entity counts across the system."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def company_count(self, active_only: bool = True) -> int:
        stmt = select(func.count()).select_from(text("companies"))
        if active_only:
            stmt = stmt.where(text("is_active = true"))
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def mill_count(self, company_id: Optional[str] = None, active_only: bool = True) -> int:
        stmt = select(func.count()).select_from(text("mills"))
        if active_only:
            stmt = stmt.where(text("is_active = true"))
        if company_id:
            stmt = stmt.where(text("company_id = :cid"))
            result = await self.db.execute(stmt, {"cid": company_id})
        else:
            result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def user_count(self, company_id: Optional[str] = None, mill_id: Optional[str] = None, active_only: bool = True) -> int:
        """User count with standard filters: is_active + deleted_at IS NULL."""
        stmt = select(func.count()).select_from(text("users"))
        if active_only:
            stmt = stmt.where(text("is_active = true"))
        stmt = stmt.where(text("deleted_at IS NULL"))
        if company_id:
            stmt = stmt.where(text("company_id = :cid"))
        if mill_id:
            stmt = stmt.where(text("mill_id = :mid"))
        params = {}
        if company_id:
            params["cid"] = company_id
        if mill_id:
            params["mid"] = mill_id
        result = await self.db.execute(stmt, params) if params else await self.db.execute(stmt)
        return result.scalar() or 0

    async def employee_count(self, company_id: Optional[str] = None, mill_id: Optional[str] = None, active_only: bool = True) -> int:
        if company_id:
            stmt = text("""
                SELECT COUNT(*) FROM employees e
                JOIN mills m ON e.mill_id = m.id
                WHERE m.company_id = :cid
            """ + (" AND e.is_active = true" if active_only else ""))
            result = await self.db.execute(stmt, {"cid": company_id})
            return result.scalar() or 0
        stmt = select(func.count()).select_from(text("employees"))
        if active_only:
            stmt = stmt.where(text("is_active = true"))
        if mill_id:
            stmt = stmt.where(text("mill_id = :mid"))
            result = await self.db.execute(stmt, {"mid": mill_id})
        else:
            result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def per_company_stats(self) -> List[Dict]:
        """Returns list of {company_id, code, name, user_count, active_user_count, mill_count, active_mill_count}."""
        result = await self.db.execute(text("""
            SELECT
                c.id AS company_id,
                c.code,
                c.name,
                (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true AND u.deleted_at IS NULL) AS user_count,
                (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id AND u.is_active = true AND u.deleted_at IS NULL) AS active_user_count,
                (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id AND m.is_active = true) AS mill_count,
                (SELECT COUNT(*) FROM mills m WHERE m.company_id = c.id AND m.is_active = true) AS active_mill_count
            FROM companies c
            ORDER BY c.name
        """))
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
            for row in result.fetchall()
        ]

    async def global_stats(self) -> Dict:
        """Returns {total_companies, active_companies, total_mills, active_mills, total_users, active_users, total_employees, active_employees}."""
        result = await self.db.execute(text("""
            SELECT
                (SELECT COUNT(*) FROM companies) AS total_companies,
                (SELECT COUNT(*) FROM companies WHERE is_active = true) AS active_companies,
                (SELECT COUNT(*) FROM mills) AS total_mills,
                (SELECT COUNT(*) FROM mills WHERE is_active = true) AS active_mills,
                (SELECT COUNT(*) FROM users) AS total_users,
                (SELECT COUNT(*) FROM users WHERE is_active = true AND deleted_at IS NULL) AS active_users,
                (SELECT COUNT(*) FROM employees) AS total_employees,
                (SELECT COUNT(*) FROM employees WHERE is_active = true) AS active_employees
        """))
        row = result.fetchone()
        if not row:
            row = type("Row", (), {k: 0 for k in ("total_companies", "active_companies", "total_mills", "active_mills", "total_users", "active_users", "total_employees", "active_employees")})()
        return {
            "total_companies": row.total_companies or 0,
            "active_companies": row.active_companies or 0,
            "total_mills": row.total_mills or 0,
            "active_mills": row.active_mills or 0,
            "total_users": row.total_users or 0,
            "active_users": row.active_users or 0,
            "total_employees": row.total_employees or 0,
            "active_employees": row.active_employees or 0,
        }

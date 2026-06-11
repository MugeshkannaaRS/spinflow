"""Alert service — Wave 4A.

Handles alert creation, acknowledgement, resolution, and seeding of default rules.
Called by background task loop and API endpoints.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerts import (
    AlertEvent, AlertAcknowledgement, AlertRule,
    AlertStatus, AlertSeverity,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Create an alert event (and fire notifications to target roles)
# ---------------------------------------------------------------------------

async def create_alert(
    db: AsyncSession,
    *,
    company_id: str,
    title: str,
    category: str,
    severity: str = AlertSeverity.WARNING,
    message: Optional[str] = None,
    rule_id: Optional[str] = None,
    mill_id: Optional[str] = None,
    source_type: Optional[str] = None,
    source_id: Optional[str] = None,
    source_data: Optional[dict] = None,
    target_role: Optional[str] = None,
    escalation_delay_minutes: int = 30,
    notify: bool = True,
) -> AlertEvent:
    """Create an AlertEvent and send notifications to target_role users."""
    now = datetime.utcnow()
    next_esc = now + timedelta(minutes=escalation_delay_minutes) if escalation_delay_minutes > 0 else None

    event = AlertEvent(
        rule_id=rule_id,
        company_id=company_id,
        mill_id=mill_id,
        source_type=source_type,
        source_id=source_id,
        source_data=source_data or {},
        title=title,
        message=message,
        severity=severity,
        category=category,
        status=AlertStatus.OPEN,
        target_role=target_role,
        next_escalation_at=next_esc,
    )
    db.add(event)
    await db.flush()

    if notify and target_role:
        try:
            from app.services.notification_service import notify_role
            priority = "URGENT" if severity in ("CRITICAL", "EMERGENCY") else "HIGH"
            await notify_role(
                db,
                company_id=company_id,
                role_code=target_role,
                title=title,
                message=message,
                severity=severity,
                category=category,
                priority=priority,
                source_type="alert_event",
                source_id=event.id,
                mill_id=mill_id,
            )
        except Exception as e:
            logger.warning("Alert notification failed (non-fatal): %s", e)

    return event


# ---------------------------------------------------------------------------
# Acknowledge / resolve
# ---------------------------------------------------------------------------

async def acknowledge_alert(
    db: AsyncSession,
    *,
    alert_event_id: str,
    user_id: str,
    notes: Optional[str] = None,
) -> bool:
    event = await db.get(AlertEvent, alert_event_id)
    if not event:
        return False
    if event.status not in (AlertStatus.OPEN, AlertStatus.ESCALATED):
        return False

    event.status = AlertStatus.ACKNOWLEDGED
    event.acknowledged_by = user_id
    event.acknowledged_at = datetime.utcnow()

    ack = AlertAcknowledgement(
        alert_event_id=alert_event_id,
        user_id=user_id,
        action="ACKNOWLEDGED",
        notes=notes,
    )
    db.add(ack)
    return True


async def resolve_alert(
    db: AsyncSession,
    *,
    alert_event_id: str,
    user_id: str,
    notes: Optional[str] = None,
) -> bool:
    event = await db.get(AlertEvent, alert_event_id)
    if not event:
        return False

    event.status = AlertStatus.RESOLVED
    event.resolved_by = user_id
    event.resolved_at = datetime.utcnow()
    event.next_escalation_at = None

    ack = AlertAcknowledgement(
        alert_event_id=alert_event_id,
        user_id=user_id,
        action="RESOLVED",
        notes=notes,
    )
    db.add(ack)
    return True


# ---------------------------------------------------------------------------
# Seed default alert rules for a company
# ---------------------------------------------------------------------------

_DEFAULT_RULES = [
    {
        "name": "Machine Breakdown",
        "category": "MACHINE",
        "condition_type": "machine.status.breakdown",
        "severity": "CRITICAL",
        "target_roles": ["MACHINE_OPERATOR", "SUPERVISOR", "PRODUCTION_MANAGER"],
        "cooldown_minutes": 30,
        "is_system": True,
        "description": "Fires when a machine is marked as broken down",
    },
    {
        "name": "Low Stock",
        "category": "INVENTORY",
        "condition_type": "stock.below_minimum",
        "severity": "WARNING",
        "target_roles": ["STORE_MANAGER", "GENERAL_MANAGER"],
        "cooldown_minutes": 120,
        "is_system": True,
        "description": "Fires when inventory stock falls below minimum threshold",
    },
    {
        "name": "Quality Rejection",
        "category": "MACHINE",
        "condition_type": "quality.lot_rejected",
        "severity": "WARNING",
        "target_roles": ["QUALITY_MANAGER", "PRODUCTION_MANAGER"],
        "cooldown_minutes": 60,
        "is_system": True,
        "description": "Fires when a quality test marks a lot as rejected",
    },
    {
        "name": "Subscription Expiring",
        "category": "BILLING",
        "condition_type": "billing.subscription_expiring_soon",
        "severity": "WARNING",
        "target_roles": ["MILL_OWNER"],
        "cooldown_minutes": 1440,
        "is_system": True,
        "description": "Fires 7 days before subscription expiry",
    },
    {
        "name": "High Absenteeism",
        "category": "HR",
        "condition_type": "hr.absenteeism_spike",
        "threshold_value": 20.0,
        "threshold_unit": "percent",
        "severity": "WARNING",
        "target_roles": ["HR_MANAGER", "GENERAL_MANAGER"],
        "cooldown_minutes": 720,
        "is_system": True,
        "description": "Fires when absenteeism exceeds 20% in a shift",
    },
]


async def seed_default_rules(db: AsyncSession, company_id: str) -> int:
    """Seed global alert rules for a newly onboarded company. Returns count seeded."""
    seeded = 0
    for rule_def in _DEFAULT_RULES:
        existing = await db.execute(
            select(AlertRule).where(
                AlertRule.company_id == company_id,
                AlertRule.condition_type == rule_def["condition_type"],
            )
        )
        if existing.scalar_one_or_none():
            continue
        rule = AlertRule(
            company_id=company_id,
            name=rule_def["name"],
            description=rule_def.get("description"),
            category=rule_def["category"],
            condition_type=rule_def["condition_type"],
            threshold_value=rule_def.get("threshold_value"),
            threshold_unit=rule_def.get("threshold_unit"),
            severity=rule_def["severity"],
            target_roles=rule_def.get("target_roles", []),
            is_active=True,
            is_system=rule_def.get("is_system", False),
            cooldown_minutes=rule_def.get("cooldown_minutes", 60),
        )
        db.add(rule)
        seeded += 1
    if seeded:
        await db.flush()
    return seeded


# ---------------------------------------------------------------------------
# Take a daily usage snapshot for all companies (called by background loop)
# ---------------------------------------------------------------------------

async def take_usage_snapshot(db: AsyncSession) -> int:
    """Upsert a usage snapshot for every active company. Returns count."""
    from datetime import date
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models.alerts import UsageSnapshot
    from app.models.masters import Company, Mill
    from app.models.user import User
    from app.models.hr import Employee
    from app.models.production import Machine

    today = date.today()
    companies = (await db.execute(
        select(Company).where(Company.status == "active")
    )).scalars().all()

    count = 0
    for company in companies:
        cid = str(company.id)

        active_users = (await db.execute(
            select(func_count(User.id)).where(
                User.company_id == cid,
                User.is_active == True,
                User.deleted_at.is_(None),
            )
        )).scalar() or 0

        total_mills = (await db.execute(
            select(func_count(Mill.id)).where(Mill.company_id == cid)
        )).scalar() or 0

        total_machines = (await db.execute(
            select(func_count(Machine.id))
            .join(Mill, Mill.id == Machine.mill_id)
            .where(Mill.company_id == cid)
        )).scalar() or 0

        total_employees = (await db.execute(
            select(func_count(Employee.id))
            .join(Mill, Mill.id == Employee.mill_id)
            .where(Mill.company_id == cid, Employee.is_active == True)
        )).scalar() or 0

        await db.execute(
            pg_insert(UsageSnapshot).values(
                id=_new_uuid(),
                company_id=cid,
                snapshot_date=today,
                active_users=active_users,
                total_employees=total_employees,
                total_machines=total_machines,
                total_mills=total_mills,
            ).on_conflict_do_update(
                index_elements=["company_id", "snapshot_date"],
                set_={
                    "active_users": active_users,
                    "total_employees": total_employees,
                    "total_machines": total_machines,
                    "total_mills": total_mills,
                },
            )
        )
        count += 1

    await db.commit()
    return count


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _new_uuid() -> str:
    import uuid
    return str(uuid.uuid4())


def func_count(col):
    from sqlalchemy import func
    return func.count(col)

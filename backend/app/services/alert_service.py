"""Alert service — Wave 4A foundation + Wave 4B operational triggers.

Handles alert creation, acknowledgement, resolution, seeding of default rules,
escalation policy seeding, and domain-specific threshold checks.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, date
from typing import Optional

from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alerts import (
    AlertEvent, AlertAcknowledgement, AlertRule, EscalationPolicy,
    AlertStatus, AlertSeverity, AlertCategory,
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
    """Create an AlertEvent and send notifications to target_role users.

    Respects cooldown: if a rule_id is given and a non-resolved alert already
    exists for that rule + source_id within cooldown_minutes, skips creation
    and returns the existing event instead.
    """
    # ── Cooldown check (rule-based dedup) ───────────────────────────────────
    if rule_id and source_id:
        rule = await db.get(AlertRule, rule_id)
        if rule and rule.cooldown_minutes > 0:
            cutoff = datetime.utcnow() - timedelta(minutes=rule.cooldown_minutes)
            existing = (await db.execute(
                select(AlertEvent).where(
                    AlertEvent.rule_id == rule_id,
                    AlertEvent.source_id == source_id,
                    AlertEvent.company_id == company_id,
                    AlertEvent.status.notin_([AlertStatus.RESOLVED]),
                    AlertEvent.created_at >= cutoff,
                )
            )).scalar_one_or_none()
            if existing:
                logger.debug("Alert cooldown active for rule %s / source %s", rule_id, source_id)
                return existing

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
    event.next_escalation_at = None  # Stop escalation chain

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
# W4B: Production threshold checks
# ---------------------------------------------------------------------------

async def check_production_thresholds(
    db: AsyncSession,
    *,
    company_id: str,
    mill_id: str,
    entry_id: str,
    machine_code: str,
    produced_kg: float,
    waste_kg: float,
    target_kg: Optional[float] = None,
    shift: Optional[str] = None,
) -> None:
    """Fire alerts when production KPIs cross rule thresholds.

    Checks: efficiency below threshold, waste above threshold, target miss.
    All alerts are guarded with try/except so they never break the entry save.
    """
    try:
        # ── Find active production alert rules for this company ──────────────
        rules_res = await db.execute(
            select(AlertRule).where(
                AlertRule.company_id == company_id,
                AlertRule.category == AlertCategory.MACHINE,
                AlertRule.is_active == True,
                AlertRule.condition_type.in_([
                    "machine.efficiency_below",
                    "machine.waste_above",
                    "machine.target_miss",
                ]),
            )
        )
        rules = rules_res.scalars().all()
        if not rules:
            return

        total_kg = produced_kg + waste_kg
        efficiency_pct = (produced_kg / total_kg * 100) if total_kg > 0 else 100.0
        waste_pct = (waste_kg / total_kg * 100) if total_kg > 0 else 0.0

        for rule in rules:
            threshold = float(rule.threshold_value or 0)
            target_role = (rule.target_roles or ["PRODUCTION_MANAGER"])[0] if rule.target_roles else "PRODUCTION_MANAGER"

            if rule.condition_type == "machine.efficiency_below":
                if efficiency_pct < threshold:
                    await create_alert(
                        db,
                        company_id=company_id,
                        mill_id=mill_id,
                        rule_id=rule.id,
                        source_type="production_entry",
                        source_id=entry_id,
                        source_data={"machine_code": machine_code, "efficiency_pct": round(efficiency_pct, 1)},
                        title=f"Low Efficiency: {machine_code} at {efficiency_pct:.1f}%",
                        message=f"Machine {machine_code} efficiency {efficiency_pct:.1f}% is below threshold {threshold}% in {shift or 'current'} shift.",
                        severity=rule.severity,
                        category=AlertCategory.MACHINE,
                        target_role=target_role,
                        escalation_delay_minutes=30,
                    )

            elif rule.condition_type == "machine.waste_above":
                if waste_pct > threshold:
                    await create_alert(
                        db,
                        company_id=company_id,
                        mill_id=mill_id,
                        rule_id=rule.id,
                        source_type="production_entry",
                        source_id=entry_id,
                        source_data={"machine_code": machine_code, "waste_pct": round(waste_pct, 1)},
                        title=f"High Waste: {machine_code} at {waste_pct:.1f}%",
                        message=f"Machine {machine_code} waste {waste_pct:.1f}% exceeds threshold {threshold}% in {shift or 'current'} shift.",
                        severity=rule.severity,
                        category=AlertCategory.MACHINE,
                        target_role=target_role,
                        escalation_delay_minutes=30,
                    )

            elif rule.condition_type == "machine.target_miss" and target_kg:
                miss_pct = ((target_kg - produced_kg) / target_kg * 100) if target_kg > 0 else 0
                if miss_pct >= threshold:
                    await create_alert(
                        db,
                        company_id=company_id,
                        mill_id=mill_id,
                        rule_id=rule.id,
                        source_type="production_entry",
                        source_id=entry_id,
                        source_data={"machine_code": machine_code, "produced_kg": produced_kg, "target_kg": target_kg},
                        title=f"Target Miss: {machine_code} produced {produced_kg:.0f}kg vs target {target_kg:.0f}kg",
                        message=f"Machine {machine_code} missed target by {miss_pct:.1f}% ({produced_kg:.0f}kg of {target_kg:.0f}kg).",
                        severity=rule.severity,
                        category=AlertCategory.MACHINE,
                        target_role=target_role,
                        escalation_delay_minutes=60,
                    )

    except Exception as exc:
        logger.warning("Production threshold check failed (non-fatal): %s", exc)


# ---------------------------------------------------------------------------
# W4B: Billing alert check (called from background loop after snapshot)
# ---------------------------------------------------------------------------

async def check_and_fire_billing_alerts(db: AsyncSession) -> int:
    """Compare each company's current usage to plan limits.
    Fires alerts at 80%, 90%, 100% thresholds. Returns count fired."""
    from app.models.billing import Subscription, SubscriptionPlan
    from app.models.masters import Company
    from app.models.alerts import UsageSnapshot
    from sqlalchemy import or_

    fired = 0
    try:
        today = date.today()
        # Get all active subscriptions with plan info
        subs_res = await db.execute(
            select(Subscription).where(Subscription.status == "active")
        )
        subscriptions = subs_res.scalars().all()

        # Cache billing rule lookups by company
        _rule_cache: dict = {}

        async def _get_billing_rule(cid: str, condition: str) -> Optional[str]:
            if (cid, condition) in _rule_cache:
                return _rule_cache[(cid, condition)]
            rule_res = await db.execute(
                select(AlertRule.id).where(
                    AlertRule.condition_type == condition,
                    or_(AlertRule.company_id == cid, AlertRule.company_id.is_(None)),
                ).order_by(AlertRule.company_id.nulls_last()).limit(1)
            )
            rule_id = rule_res.scalar_one_or_none()
            _rule_cache[(cid, condition)] = rule_id
            return rule_id

        for sub in subscriptions:
            try:
                plan = await db.get(SubscriptionPlan, sub.plan_id) if sub.plan_id else None
                if not plan:
                    continue

                company_id = str(sub.company_id)
                max_users = getattr(plan, "max_users", 0) or 0
                max_employees = getattr(plan, "max_employees", 0) or 0
                if max_users <= 0 and max_employees <= 0:
                    continue

                # Get latest snapshot
                snap_res = await db.execute(
                    select(UsageSnapshot)
                    .where(UsageSnapshot.company_id == company_id)
                    .order_by(UsageSnapshot.snapshot_date.desc())
                    .limit(1)
                )
                snap = snap_res.scalar_one_or_none()
                if not snap:
                    continue

                # Check user limit
                if max_users > 0:
                    usage_pct = (snap.active_users / max_users) * 100
                    for threshold, severity, label in [
                        (100, AlertSeverity.CRITICAL, "100%"),
                        (90, AlertSeverity.WARNING,  "90%"),
                        (80, AlertSeverity.INFO,     "80%"),
                    ]:
                        if usage_pct >= threshold:
                            rule_id = await _get_billing_rule(company_id, "billing.usage_100" if threshold >= 100 else ("billing.usage_90" if threshold >= 90 else "billing.usage_80"))
                            await create_alert(
                                db,
                                company_id=company_id,
                                title=f"User Limit {label} Reached ({snap.active_users}/{max_users})",
                                message=f"Your plan allows {max_users} users. You have {snap.active_users} active users ({usage_pct:.0f}% of limit).",
                                category=AlertCategory.BILLING,
                                severity=severity,
                                rule_id=rule_id,
                                source_type="usage_snapshot",
                                source_id=company_id,
                                target_role="MILL_OWNER",
                                escalation_delay_minutes=0,
                            )
                            fired += 1
                            break  # Only fire highest threshold

                # Check employee limit
                if max_employees > 0:
                    emp_pct = (snap.total_employees / max_employees) * 100
                    for threshold, severity, label in [
                        (100, AlertSeverity.CRITICAL, "100%"),
                        (90, AlertSeverity.WARNING,  "90%"),
                        (80, AlertSeverity.INFO,     "80%"),
                    ]:
                        if emp_pct >= threshold:
                            rule_id = await _get_billing_rule(company_id, "billing.usage_100" if threshold >= 100 else ("billing.usage_90" if threshold >= 90 else "billing.usage_80"))
                            await create_alert(
                                db,
                                company_id=company_id,
                                title=f"Employee Limit {label} Reached ({snap.total_employees}/{max_employees})",
                                message=f"Your plan allows {max_employees} employees. You have {snap.total_employees} active employees ({emp_pct:.0f}% of limit).",
                                category=AlertCategory.BILLING,
                                severity=severity,
                                rule_id=rule_id,
                                source_type="usage_snapshot",
                                source_id=company_id,
                                target_role="MILL_OWNER",
                                escalation_delay_minutes=0,
                            )
                            fired += 1
                            break

            except Exception as e:
                logger.debug("Billing alert check for sub %s failed: %s", sub.id, e)

    except Exception as exc:
        logger.warning("Billing alert check failed: %s", exc)

    return fired


# ---------------------------------------------------------------------------
# W4B: Maintenance due alert check (called from background loop)
# ---------------------------------------------------------------------------

async def check_maintenance_due_alerts(db: AsyncSession) -> int:
    """Check for PM schedules that are due or overdue. Returns count fired."""
    from app.models.maintenance import MaintenanceSchedule
    from app.models.production import Machine
    from app.models.masters import Mill

    fired = 0
    try:
        today = date.today()
        overdue_cutoff = today  # due_date <= today

        sched_res = await db.execute(
            select(MaintenanceSchedule, Machine, Mill)
            .join(Machine, Machine.code == MaintenanceSchedule.machine_code)
            .join(Mill, Mill.id == Machine.mill_id)
            .where(MaintenanceSchedule.next_due != None)
        )
        rows = sched_res.all()

        for schedule, machine, mill in rows:
            try:
                next_due_str = schedule.next_due
                if not next_due_str:
                    continue
                # Parse next_due (stored as ISO string in maintenance model)
                try:
                    next_due = date.fromisoformat(str(next_due_str)[:10])
                except (ValueError, TypeError):
                    continue

                company_id = str(mill.company_id) if mill.company_id else None
                if not company_id:
                    continue

                days_overdue = (today - next_due).days

                if days_overdue >= 7:
                    severity = AlertSeverity.CRITICAL
                    ctype = "maintenance.pm_overdue"
                    label = f"OVERDUE {days_overdue} days"
                elif days_overdue >= 0:
                    severity = AlertSeverity.WARNING
                    ctype = "maintenance.pm_due"
                    label = "DUE TODAY"
                elif days_overdue >= -3:
                    severity = AlertSeverity.INFO
                    ctype = "maintenance.pm_due"
                    label = f"due in {-days_overdue} day(s)"
                else:
                    continue

                await create_alert(
                    db,
                    company_id=company_id,
                    mill_id=str(mill.id),
                    title=f"PM {label}: {machine.code} — {schedule.type}",
                    message=f"Machine {machine.code} {schedule.type} maintenance was due {next_due.isoformat()}.",
                    category=AlertCategory.MACHINE,
                    severity=severity,
                    source_type="maintenance_schedule",
                    source_id=str(schedule.id),
                    target_role="MAINTENANCE_MANAGER",
                    escalation_delay_minutes=120 if days_overdue >= 0 else 0,
                )
                fired += 1

            except Exception as e:
                logger.debug("Maintenance alert for schedule %s failed: %s", schedule.id, e)

    except Exception as exc:
        logger.warning("Maintenance due check failed: %s", exc)

    return fired


# ---------------------------------------------------------------------------
# Seed default alert rules
# ---------------------------------------------------------------------------

_DEFAULT_RULES = [
    # ── Machine ─────────────────────────────────────────────────────────────
    {
        "name": "Machine Breakdown",
        "category": "MACHINE",
        "condition_type": "machine.status.breakdown",
        "severity": "CRITICAL",
        "target_roles": ["SUPERVISOR", "PRODUCTION_MANAGER"],
        "cooldown_minutes": 30,
        "is_system": True,
        "description": "Fires immediately when a machine is marked as broken down",
    },
    {
        "name": "Machine Idle Threshold",
        "category": "MACHINE",
        "condition_type": "machine.idle_exceeds_threshold",
        "threshold_value": 60.0,
        "threshold_unit": "minutes",
        "severity": "WARNING",
        "target_roles": ["SUPERVISOR", "PRODUCTION_MANAGER"],
        "cooldown_minutes": 60,
        "is_system": True,
        "description": "Fires when a machine has been idle more than threshold minutes",
    },
    {
        "name": "Efficiency Below Threshold",
        "category": "MACHINE",
        "condition_type": "machine.efficiency_below",
        "threshold_value": 75.0,
        "threshold_unit": "percent",
        "severity": "WARNING",
        "target_roles": ["PRODUCTION_MANAGER"],
        "cooldown_minutes": 120,
        "is_system": True,
        "description": "Fires when shift efficiency falls below threshold %",
    },
    {
        "name": "Waste Above Threshold",
        "category": "MACHINE",
        "condition_type": "machine.waste_above",
        "threshold_value": 5.0,
        "threshold_unit": "percent",
        "severity": "WARNING",
        "target_roles": ["PRODUCTION_MANAGER", "QUALITY_MANAGER"],
        "cooldown_minutes": 120,
        "is_system": True,
        "description": "Fires when waste % exceeds threshold in a shift",
    },
    {
        "name": "Production Target Miss",
        "category": "MACHINE",
        "condition_type": "machine.target_miss",
        "threshold_value": 20.0,
        "threshold_unit": "percent",
        "severity": "WARNING",
        "target_roles": ["PRODUCTION_MANAGER", "GENERAL_MANAGER"],
        "cooldown_minutes": 240,
        "is_system": True,
        "description": "Fires when production misses target by more than threshold %",
    },
    # ── Quality ──────────────────────────────────────────────────────────────
    {
        "name": "Lot Rejected",
        "category": "QUALITY",
        "condition_type": "quality.lot_rejected",
        "severity": "WARNING",
        "target_roles": ["QUALITY_MANAGER", "PRODUCTION_MANAGER"],
        "cooldown_minutes": 60,
        "is_system": True,
        "description": "Fires when a quality test marks a lot as rejected",
    },
    # ── Inventory ────────────────────────────────────────────────────────────
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
    # ── Maintenance ───────────────────────────────────────────────────────────
    {
        "name": "PM Due",
        "category": "MACHINE",
        "condition_type": "maintenance.pm_due",
        "severity": "INFO",
        "target_roles": ["MAINTENANCE_MANAGER"],
        "cooldown_minutes": 1440,
        "is_system": True,
        "description": "Fires when a preventive maintenance schedule is coming due",
    },
    {
        "name": "PM Overdue",
        "category": "MACHINE",
        "condition_type": "maintenance.pm_overdue",
        "severity": "CRITICAL",
        "target_roles": ["MAINTENANCE_MANAGER", "GENERAL_MANAGER"],
        "cooldown_minutes": 720,
        "is_system": True,
        "description": "Fires when a PM schedule is 7+ days overdue",
    },
    # ── Security ──────────────────────────────────────────────────────────────
    {
        "name": "Failed Login Burst",
        "category": "SECURITY",
        "condition_type": "security.failed_login_burst",
        "threshold_value": 5.0,
        "threshold_unit": "attempts",
        "severity": "WARNING",
        "target_roles": ["MILL_OWNER"],
        "cooldown_minutes": 30,
        "is_system": True,
        "description": "Fires when 5+ failed login attempts come from the same IP in 5 minutes",
    },
    # ── Billing ──────────────────────────────────────────────────────────────
    {
        "name": "Plan Limit 80%",
        "category": "BILLING",
        "condition_type": "billing.usage_80",
        "severity": "INFO",
        "target_roles": ["MILL_OWNER"],
        "cooldown_minutes": 1440,
        "is_system": True,
        "description": "Fires when company reaches 80% of plan user limit",
    },
    {
        "name": "Plan Limit 90%",
        "category": "BILLING",
        "condition_type": "billing.usage_90",
        "severity": "WARNING",
        "target_roles": ["MILL_OWNER"],
        "cooldown_minutes": 1440,
        "is_system": True,
        "description": "Fires when company reaches 90% of plan user limit",
    },
    {
        "name": "Plan Limit 100%",
        "category": "BILLING",
        "condition_type": "billing.usage_100",
        "severity": "CRITICAL",
        "target_roles": ["MILL_OWNER"],
        "cooldown_minutes": 720,
        "is_system": True,
        "description": "Fires when company hits or exceeds plan user limit",
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
    # ── HR ───────────────────────────────────────────────────────────────────
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
    """Seed system alert rules for a company. Idempotent — skips existing."""
    seeded = 0
    for rule_def in _DEFAULT_RULES:
        existing = (await db.execute(
            select(AlertRule).where(
                AlertRule.company_id == company_id,
                AlertRule.condition_type == rule_def["condition_type"],
            )
        )).scalar_one_or_none()
        if existing:
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
# W4B: Seed escalation policies (5-level ladder)
# ---------------------------------------------------------------------------

# Escalation ladder: step → (role, delay_minutes)
# MACHINE/CRITICAL: Supervisor(15) → Production Manager(30) → GM(60) → Mill Owner(120)
# MACHINE/WARNING:  Production Manager(30) → GM(60)
# SECURITY/WARNING: Mill Owner(15) → Super Admin via notification(30)
# BILLING/CRITICAL: Mill Owner(0)
# BILLING/WARNING:  Mill Owner(60)

_ESCALATION_POLICIES = [
    # ── Machine CRITICAL ─────────────────────────────────────────────────
    {"category": "MACHINE", "severity": "CRITICAL", "step": 1, "target_role": "SUPERVISOR",          "delay_minutes": 15},
    {"category": "MACHINE", "severity": "CRITICAL", "step": 2, "target_role": "PRODUCTION_MANAGER",  "delay_minutes": 30},
    {"category": "MACHINE", "severity": "CRITICAL", "step": 3, "target_role": "GENERAL_MANAGER",     "delay_minutes": 60},
    {"category": "MACHINE", "severity": "CRITICAL", "step": 4, "target_role": "MILL_OWNER",          "delay_minutes": 120},
    # ── Machine WARNING ──────────────────────────────────────────────────
    {"category": "MACHINE", "severity": "WARNING",  "step": 1, "target_role": "PRODUCTION_MANAGER",  "delay_minutes": 30},
    {"category": "MACHINE", "severity": "WARNING",  "step": 2, "target_role": "GENERAL_MANAGER",     "delay_minutes": 60},
    # ── Security WARNING ─────────────────────────────────────────────────
    {"category": "SECURITY", "severity": "WARNING", "step": 1, "target_role": "MILL_OWNER",          "delay_minutes": 15},
    {"category": "SECURITY", "severity": "CRITICAL","step": 1, "target_role": "MILL_OWNER",          "delay_minutes": 5},
    # ── Billing ─────────────────────────────────────────────────────────
    {"category": "BILLING",  "severity": "WARNING", "step": 1, "target_role": "MILL_OWNER",          "delay_minutes": 60},
    {"category": "BILLING",  "severity": "CRITICAL","step": 1, "target_role": "MILL_OWNER",          "delay_minutes": 15},
    # ── HR ──────────────────────────────────────────────────────────────
    {"category": "HR",       "severity": "WARNING", "step": 1, "target_role": "HR_MANAGER",          "delay_minutes": 60},
    {"category": "HR",       "severity": "WARNING", "step": 2, "target_role": "GENERAL_MANAGER",     "delay_minutes": 120},
]


async def seed_escalation_policies(db: AsyncSession, company_id: Optional[str] = None) -> int:
    """Seed escalation policies. company_id=None seeds global (NULL) policies.
    Idempotent — skips existing rows."""
    from sqlalchemy import and_

    seeded = 0
    for policy_def in _ESCALATION_POLICIES:
        existing = (await db.execute(
            select(EscalationPolicy).where(
                EscalationPolicy.company_id == company_id,
                EscalationPolicy.category == policy_def["category"],
                EscalationPolicy.severity == policy_def["severity"],
                EscalationPolicy.step == policy_def["step"],
            )
        )).scalar_one_or_none()
        if existing:
            continue

        policy = EscalationPolicy(
            company_id=company_id,
            category=policy_def["category"],
            severity=policy_def["severity"],
            step=policy_def["step"],
            target_role=policy_def["target_role"],
            delay_minutes=policy_def["delay_minutes"],
            is_active=True,
        )
        db.add(policy)
        seeded += 1

    if seeded:
        await db.flush()
    return seeded


# ---------------------------------------------------------------------------
# Take a daily usage snapshot for all companies (called by background loop)
# ---------------------------------------------------------------------------

async def take_usage_snapshot(db: AsyncSession) -> int:
    """Upsert a usage snapshot for every active company. Returns count."""
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
            select(func.count(User.id)).where(
                User.company_id == cid,
                User.is_active == True,
                User.deleted_at.is_(None),
            )
        )).scalar() or 0

        total_mills = (await db.execute(
            select(func.count(Mill.id)).where(Mill.company_id == cid)
        )).scalar() or 0

        total_machines = (await db.execute(
            select(func.count(Machine.id))
            .join(Mill, Mill.id == Machine.mill_id)
            .where(Mill.company_id == cid)
        )).scalar() or 0

        total_employees = (await db.execute(
            select(func.count(Employee.id))
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

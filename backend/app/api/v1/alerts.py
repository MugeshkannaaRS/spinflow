"""Alert API — Wave 4A foundation + Wave 4B operational endpoints.

Endpoints:
  GET    /alerts                          — list alert events (scoped)
  GET    /alerts/ops-center               — KPI summary for operations dashboard
  GET    /alerts/{id}                     — get one alert event
  GET    /alerts/{id}/timeline            — full ACK history for one alert
  POST   /alerts/{id}/acknowledge         — acknowledge an open alert
  POST   /alerts/{id}/resolve             — resolve an alert
  GET    /alerts/rules                    — list alert rules
  POST   /alerts/rules                    — create a rule (MILL_OWNER / SUPER_ADMIN)
  PATCH  /alerts/rules/{id}              — update a rule
  DELETE /alerts/rules/{id}              — delete a rule
  POST   /alerts/seed                    — reseed default rules (SUPER_ADMIN / MILL_OWNER)
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, extract
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime, timedelta

from app.db.session import get_db
from app.core.deps import get_current_user, get_mill_scope
from app.models.user import User
from app.models.alerts import AlertEvent, AlertRule, AlertStatus, AlertAcknowledgement
from app.services.alert_service import acknowledge_alert, resolve_alert

router = APIRouter()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class AlertEventResponse(BaseModel):
    id: str
    title: str
    message: Optional[str] = None
    severity: str
    category: str
    status: str
    target_role: Optional[str] = None
    company_id: str
    mill_id: Optional[str] = None
    source_type: Optional[str] = None
    source_id: Optional[str] = None
    escalation_level: int
    acknowledged_at: Optional[str] = None
    resolved_at: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class AlertRuleResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    category: str
    condition_type: str
    threshold_value: Optional[float] = None
    threshold_unit: Optional[str] = None
    severity: str
    target_roles: Optional[list] = None
    is_active: bool
    is_system: bool
    cooldown_minutes: int
    company_id: Optional[str] = None

    class Config:
        from_attributes = True


def _event_to_resp(e: AlertEvent) -> AlertEventResponse:
    return AlertEventResponse(
        id=e.id,
        title=e.title,
        message=e.message,
        severity=e.severity,
        category=e.category,
        status=e.status,
        target_role=e.target_role,
        company_id=e.company_id,
        mill_id=e.mill_id,
        source_type=e.source_type,
        source_id=e.source_id,
        escalation_level=e.escalation_level,
        acknowledged_at=e.acknowledged_at.isoformat() if e.acknowledged_at else None,
        resolved_at=e.resolved_at.isoformat() if e.resolved_at else None,
        created_at=e.created_at.isoformat() if e.created_at else "",
    )


# ---------------------------------------------------------------------------
# GET /alerts
# ---------------------------------------------------------------------------

@router.get("/alerts")
async def list_alerts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
):
    scope = await get_mill_scope(current_user, db)
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")

    query = select(AlertEvent)

    if role_code != "SUPER_ADMIN":
        company_id = scope.get("company_id") or str(current_user.company_id or "")
        if not company_id:
            return {"total": 0, "data": []}
        query = query.where(AlertEvent.company_id == company_id)

    if scope.get("mill_id"):
        query = query.where(AlertEvent.mill_id == scope["mill_id"])

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            query = query.where(AlertEvent.status.in_(statuses))
    if category:
        query = query.where(AlertEvent.category == category)
    if severity:
        query = query.where(AlertEvent.severity == severity)

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar() or 0

    query = query.order_by(desc(AlertEvent.created_at)).offset((page - 1) * page_size).limit(page_size)
    events = (await db.execute(query)).scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "data": [_event_to_resp(e) for e in events],
    }


# ---------------------------------------------------------------------------
# GET /alerts/ops-center  — KPI summary (W4B)
# NOTE: This route must come BEFORE /alerts/{alert_id} to avoid capturing
# the literal string "ops-center" as alert_id.
# ---------------------------------------------------------------------------

@router.get("/alerts/ops-center")
async def ops_center_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns KPI summary for the operations center dashboard."""
    scope = await get_mill_scope(current_user, db)
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    company_id = scope.get("company_id") or (str(current_user.company_id) if current_user.company_id else None)
    mill_id = scope.get("mill_id")

    def _base(status_filter=None):
        q = select(AlertEvent)
        if role_code != "SUPER_ADMIN":
            if not company_id:
                return None
            q = q.where(AlertEvent.company_id == company_id)
        if mill_id:
            q = q.where(AlertEvent.mill_id == mill_id)
        if status_filter:
            q = q.where(AlertEvent.status == status_filter)
        return q

    # Counts
    open_q = _base(AlertStatus.OPEN)
    escalated_q = _base(AlertStatus.ESCALATED)
    critical_q = _base()
    if critical_q is not None:
        critical_q = critical_q.where(
            AlertEvent.severity == "CRITICAL",
            AlertEvent.status.notin_(["RESOLVED"]),
        )

    open_count      = (await db.execute(select(func.count()).select_from(open_q.subquery()))).scalar() or 0 if open_q is not None else 0
    escalated_count = (await db.execute(select(func.count()).select_from(escalated_q.subquery()))).scalar() or 0 if escalated_q is not None else 0
    critical_count  = (await db.execute(select(func.count()).select_from(critical_q.subquery()))).scalar() or 0 if critical_q is not None else 0

    # Breakdown count (today)
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    breakdown_q = select(func.count(AlertEvent.id)).where(
        AlertEvent.category == "MACHINE",
        AlertEvent.source_type.contains("machine"),
        AlertEvent.created_at >= today_start,
    )
    if role_code != "SUPER_ADMIN" and company_id:
        breakdown_q = breakdown_q.where(AlertEvent.company_id == company_id)
    if mill_id:
        breakdown_q = breakdown_q.where(AlertEvent.mill_id == mill_id)
    breakdown_count = (await db.execute(breakdown_q)).scalar() or 0

    # Average resolution time (last 30 days, resolved alerts) — SQL AVG
    avg_q = select(
        func.count(AlertEvent.id).label("cnt"),
        func.avg(
            extract("epoch", AlertEvent.resolved_at) - extract("epoch", AlertEvent.created_at)
        ).label("avg_seconds"),
    ).where(
        AlertEvent.status == AlertStatus.RESOLVED,
        AlertEvent.resolved_at.isnot(None),
        AlertEvent.created_at >= (datetime.utcnow() - timedelta(days=30)),
    )
    if role_code != "SUPER_ADMIN" and company_id:
        avg_q = avg_q.where(AlertEvent.company_id == company_id)
    avg_row = (await db.execute(avg_q)).one()
    resolved_last_30d = avg_row.cnt or 0
    avg_resolution_min = round((avg_row.avg_seconds or 0) / 60, 1) if avg_row.avg_seconds else None

    # Recent alerts (last 10 unresolved for quick view)
    recent_q = select(AlertEvent).where(
        AlertEvent.status.notin_([AlertStatus.RESOLVED]),
    ).order_by(desc(AlertEvent.created_at)).limit(10)
    if role_code != "SUPER_ADMIN" and company_id:
        recent_q = recent_q.where(AlertEvent.company_id == company_id)
    if mill_id:
        recent_q = recent_q.where(AlertEvent.mill_id == mill_id)
    recent_events = (await db.execute(recent_q)).scalars().all()

    return {
        "critical_count": critical_count,
        "open_count": open_count,
        "escalated_count": escalated_count,
        "breakdown_count_today": breakdown_count,
        "avg_resolution_min": avg_resolution_min,
        "resolved_last_30d": resolved_last_30d,
        "recent_alerts": [_event_to_resp(e) for e in recent_events],
    }


# ---------------------------------------------------------------------------
# GET /alerts/{id}/timeline  — ACK history (W4B)
# ---------------------------------------------------------------------------

@router.get("/alerts/{alert_id}/timeline")
async def alert_timeline(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns ordered list of acknowledgement/action records for one alert."""
    event = await db.get(AlertEvent, alert_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")

    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code != "SUPER_ADMIN":
        company_id = str(current_user.company_id or "")
        if event.company_id != company_id:
            raise HTTPException(status_code=403, detail="Not in your company scope")

    acks_res = await db.execute(
        select(AlertAcknowledgement)
        .where(AlertAcknowledgement.alert_event_id == alert_id)
        .order_by(AlertAcknowledgement.created_at)
    )
    acks = acks_res.scalars().all()

    # Build timeline: CREATED (from event) + each ACK record
    timeline = [
        {
            "action": "CREATED",
            "user_id": None,
            "notes": event.message,
            "timestamp": event.created_at.isoformat() if event.created_at else None,
            "severity": event.severity,
        }
    ]
    for ack in acks:
        timeline.append({
            "action": ack.action,
            "user_id": ack.user_id,
            "notes": ack.notes,
            "timestamp": ack.created_at.isoformat() if ack.created_at else None,
        })

    return {
        "alert": _event_to_resp(event),
        "timeline": timeline,
    }


# ---------------------------------------------------------------------------
# POST /alerts/seed  — reseed rules (W4B)
# ---------------------------------------------------------------------------

@router.post("/alerts/seed")
async def seed_alert_rules(
    company_id: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reseed default alert rules + escalation policies for a company."""
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Insufficient permission")

    target_company = company_id or str(current_user.company_id or "")
    if not target_company:
        raise HTTPException(status_code=400, detail="company_id required")

    from app.services.alert_service import seed_default_rules, seed_escalation_policies
    n_rules = await seed_default_rules(db, company_id=target_company)
    n_pol   = await seed_escalation_policies(db, company_id=target_company)
    await db.commit()
    return {"rules_seeded": n_rules, "policies_seeded": n_pol}


# ---------------------------------------------------------------------------
# GET /alerts/{id}
# ---------------------------------------------------------------------------

@router.get("/alerts/{alert_id}")
async def get_alert(
    alert_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(AlertEvent, alert_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")

    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code != "SUPER_ADMIN":
        company_id = str(current_user.company_id or "")
        if event.company_id != company_id:
            raise HTTPException(status_code=403, detail="Not in your company scope")

    return _event_to_resp(event)


# ---------------------------------------------------------------------------
# POST /alerts/{id}/acknowledge
# ---------------------------------------------------------------------------

class ActionBody(BaseModel):
    notes: Optional[str] = None


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge(
    alert_id: str,
    body: ActionBody = ActionBody(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(AlertEvent, alert_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        caller_company = str(current_user.company_id or "")
        if not caller_company or event.company_id != caller_company:
            raise HTTPException(status_code=403, detail="Not authorised to acknowledge this alert")
    ok = await acknowledge_alert(
        db,
        alert_event_id=alert_id,
        user_id=str(current_user.id),
        notes=body.notes,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found or not in acknowledgeable state")
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# POST /alerts/{id}/resolve
# ---------------------------------------------------------------------------

@router.post("/alerts/{alert_id}/resolve")
async def resolve(
    alert_id: str,
    body: ActionBody = ActionBody(),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    event = await db.get(AlertEvent, alert_id)
    if not event:
        raise HTTPException(status_code=404, detail="Alert not found")
    role_code = current_user.role_rel.code if current_user.role_rel else ""
    if role_code != "SUPER_ADMIN":
        caller_company = str(current_user.company_id or "")
        if not caller_company or event.company_id != caller_company:
            raise HTTPException(status_code=403, detail="Not authorised to resolve this alert")
    ok = await resolve_alert(
        db,
        alert_event_id=alert_id,
        user_id=str(current_user.id),
        notes=body.notes,
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# GET /alerts/rules
# ---------------------------------------------------------------------------

@router.get("/alerts/rules")
async def list_rules(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    active_only: bool = True,
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    company_id = str(current_user.company_id) if current_user.company_id else None

    from sqlalchemy import or_

    query = select(AlertRule)
    if role_code != "SUPER_ADMIN":
        if not company_id:
            return {"data": []}
        # Return global rules + company-specific rules
        query = query.where(
            or_(AlertRule.company_id == company_id, AlertRule.company_id.is_(None))
        )

    if active_only:
        query = query.where(AlertRule.is_active == True)

    rules = (await db.execute(query)).scalars().all()
    return {"data": [AlertRuleResponse.model_validate(r) for r in rules]}


# ---------------------------------------------------------------------------
# POST /alerts/rules
# ---------------------------------------------------------------------------

class CreateRuleBody(BaseModel):
    name: str
    description: Optional[str] = None
    category: str
    condition_type: str
    threshold_value: Optional[float] = None
    threshold_unit: Optional[str] = None
    severity: str = "WARNING"
    target_roles: Optional[list] = None
    cooldown_minutes: int = 60
    mill_id: Optional[str] = None


@router.post("/alerts/rules", status_code=201)
async def create_rule(
    body: CreateRuleBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Only MILL_OWNER or SUPER_ADMIN can create alert rules")

    company_id = str(current_user.company_id) if current_user.company_id else None

    rule = AlertRule(
        company_id=company_id if role_code != "SUPER_ADMIN" else None,
        mill_id=body.mill_id,
        name=body.name,
        description=body.description,
        category=body.category,
        condition_type=body.condition_type,
        threshold_value=body.threshold_value,
        threshold_unit=body.threshold_unit,
        severity=body.severity,
        target_roles=body.target_roles or [],
        cooldown_minutes=body.cooldown_minutes,
        is_active=True,
        is_system=False,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


# ---------------------------------------------------------------------------
# PATCH /alerts/rules/{id}
# ---------------------------------------------------------------------------

class UpdateRuleBody(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    severity: Optional[str] = None
    threshold_value: Optional[float] = None
    cooldown_minutes: Optional[int] = None


@router.patch("/alerts/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    body: UpdateRuleBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Insufficient permission")

    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if role_code != "SUPER_ADMIN" and rule.company_id != str(current_user.company_id or ""):
        raise HTTPException(status_code=403, detail="Cannot modify another company's rule")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(rule, field, value)

    rule.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(rule)
    return AlertRuleResponse.model_validate(rule)


# ---------------------------------------------------------------------------
# DELETE /alerts/rules/{id}
# ---------------------------------------------------------------------------

@router.delete("/alerts/rules/{rule_id}")
async def delete_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role_code = current_user.role_rel.code if current_user.role_rel else (current_user.role or "")
    if role_code not in ("SUPER_ADMIN", "MILL_OWNER"):
        raise HTTPException(status_code=403, detail="Insufficient permission")

    rule = await db.get(AlertRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")

    if rule.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system rules — disable them instead")

    if role_code != "SUPER_ADMIN" and rule.company_id != str(current_user.company_id or ""):
        raise HTTPException(status_code=403, detail="Cannot delete another company's rule")

    await db.delete(rule)
    await db.commit()
    return {"success": True}

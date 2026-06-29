# SpinFlow ERP — Wave 4 Enterprise Operations Platform
## Complete Architecture Blueprint

**Date:** 2026-06-11  
**Prepared by:** SpinFlow CTO / Architect  
**Status:** Approved for Implementation  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Audit](#2-current-state-audit)
3. [Gap Analysis](#3-gap-analysis)
4. [Architecture Design](#4-architecture-design)
5. [Implementation Waves](#5-implementation-waves)
6. [Risk Assessment](#6-risk-assessment)
7. [P0 Bug Fixes (Immediate)](#7-p0-bug-fixes-immediate)

---

## 1. Executive Summary

Wave 4 transforms SpinFlow from a functional ERP into a **commercial-grade, multi-tenant enterprise platform** capable of serving 100+ spinning mills. The current system has solid transactional foundations but zero observability, no intelligent alerting, and incomplete billing enforcement. Wave 4 closes all enterprise gaps.

**Investment:** ~14 development days  
**Impact:** Enables commercial sales at ₹15k–50k/mo per mill  
**Risk if skipped:** Cannot detect downtime, security breaches, billing overages, or escalate incidents

---

## 2. Current State Audit

### 2.1 What EXISTS Today

#### Audit & Logging
| Component | State |
|-----------|-------|
| `AuditLog` model | 7 fields: user_id, action, entity, old/new value, ip_address, created_at |
| `GET /audit/logs` | Single endpoint, basic filters (user/action/entity/date) |
| Log categories | ❌ None |
| Log severity | ❌ None |
| Company/mill scoping | ❌ Not in audit_logs table |
| Archive / retention | ❌ None |
| Download (CSV/Excel/PDF) | ❌ None |
| Soft delete / hard delete | ❌ None |

#### Billing
| Component | State |
|-----------|-------|
| `SubscriptionPlan` | ✅ Exists (code, name, price, mills, users, module prices) |
| `CompanySubscription` | ✅ Exists (status, billing cycle, trial/expiry dates, overdue) |
| `BillingInvoice` | ✅ Exists (full model, line items, tax, PDF content) |
| `BillingPayment` | ✅ Exists |
| `OveragePricing` | ✅ Exists |
| `SubscriptionChangeRequest` | ✅ Exists but **BUGGY** (400 if no subscription row) |
| Plan lifecycle enforcement | ⚠️ Partial — expiry checked, but grace/suspended not enforced |
| Usage tracking | ❌ No snapshot/tracking table |
| Billing alerts | ❌ None |
| Invoice PDF download | ✅ `/billing/invoices/{id}/download` |
| Super admin billing view | ✅ `/admin/billing/overview` (MRR, ARR, churn estimated) |
| Change request workflow | ⚠️ Exists but broken (see P0 fixes) |

#### Alerts & Notifications
| Component | State |
|-----------|-------|
| Alert model | ❌ Zero |
| Notification model | ❌ Zero |
| Escalation engine | ❌ Zero |
| WebSocket infra | ✅ `ConnectionManager` in ws/notifications.py — `send_to_user()`, `broadcast()` |
| Machine alerts | ❌ None |
| Security alerts | ❌ None |
| HR alerts | ❌ None |
| Billing alerts | ❌ None |
| Inventory alerts | ❌ None |
| In-app notification center | ❌ None |

#### Dashboard & Reports
| Component | State |
|-----------|-------|
| `GET /dashboard/kpis` | ✅ Role-filtered KPI blocks |
| `GET /dashboard/summary` | ✅ Single endpoint, role-based sections |
| Per-role dashboards | ⚠️ Role filter on single endpoint — not per-role optimized |
| Alert widget | ❌ None |
| Pending actions widget | ❌ None |
| Production reports | ✅ Basic PDF |
| Security reports | ❌ None |
| Alert/escalation reports | ❌ None |
| Usage reports | ❌ None |

#### Background Jobs
| Component | State |
|-----------|-------|
| `_expiry_loop` | ✅ Every 3600s in lifespan — checks subscription expiry |
| Alert evaluation loop | ❌ None |
| Log archive job | ❌ None |
| Usage snapshot job | ❌ None |
| No APScheduler/Celery | ✅ Design constraint — extend existing asyncio loop |

---

## 3. Gap Analysis

### Complete Gap Table

| Feature | Current | Gap | Priority |
|---------|---------|-----|----------|
| Log category (SECURITY/PRODUCTION/etc.) | Missing | Add column to audit_logs | P0 |
| Log severity (INFO/WARNING/CRITICAL) | Missing | Add column to audit_logs | P0 |
| Log company_id/mill_id scoping | Missing | Add columns to audit_logs | P0 |
| Log download CSV/Excel | Missing | New endpoint | P1 |
| Log soft delete (SUPER_ADMIN) | Missing | Add deleted_at + endpoint | P1 |
| Log hard delete (SUPER_ADMIN) | Missing | New endpoint | P1 |
| Log archive (90d → archive table) | Missing | New table + background job | P2 |
| Log retention policy config | Missing | New config table | P2 |
| System alerts model | Missing | New table | P0 |
| Alert categories (5 types) | Missing | New model fields | P0 |
| Alert severity levels (4 levels) | Missing | New model fields | P0 |
| Alert acknowledgement | Missing | New endpoint | P0 |
| Alert escalation engine | Missing | New policies table + loop | P1 |
| Notification model (in-app) | Missing | New table | P0 |
| Notification API (read/archive) | Missing | New endpoints | P0 |
| Unread count | Missing | New endpoint | P0 |
| WebSocket push for notifications | Infra exists | Wire to notification model | P1 |
| Machine breakdown alerts | Missing | Alert evaluation service | P1 |
| Machine idle alerts | Missing | Alert evaluation service | P1 |
| Production target miss alerts | Missing | Alert evaluation service | P1 |
| Security: failed login alerts | Missing | Auth hook → alert creation | P1 |
| Security: permission denied alerts | Missing | Access hook → alert | P1 |
| HR: absent employee alerts | Missing | Attendance evaluation | P2 |
| HR: payroll pending alerts | Missing | Payroll evaluation | P2 |
| Billing: trial ending alerts | Missing | Billing evaluation | P0 |
| Billing: subscription expiring | Missing | Billing evaluation | P0 |
| Billing: plan limit exceeded | Missing | Usage check | P1 |
| Inventory: low stock alerts | Missing | Stock evaluation | P1 |
| Change request 400 bug | BROKEN | Fix missing-subscription path | P0 |
| Subscription grace period enforcement | Partial | Add grace period logic | P1 |
| Usage tracking snapshots | Missing | New table + daily job | P1 |
| Usage vs limits display | Missing | New API endpoint | P1 |
| Per-role dashboards | Partial | Role-specific API optimization | P2 |
| Alert reports | Missing | New report endpoints | P2 |
| Security reports | Missing | New report endpoints | P2 |
| Usage reports | Missing | New report endpoints | P2 |

---

## 4. Architecture Design

### 4.1 Database Schema — New Tables (Migration 028)

#### 4.1.1 Extend `audit_logs` (ALTER TABLE)

```sql
ALTER TABLE audit_logs
  ADD COLUMN category      VARCHAR(50)  DEFAULT 'USER_ACTIVITY',
  ADD COLUMN severity      VARCHAR(20)  DEFAULT 'INFO',
  ADD COLUMN company_id    VARCHAR(36)  REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN mill_id       VARCHAR(36)  REFERENCES mills(id) ON DELETE SET NULL,
  ADD COLUMN module        VARCHAR(100),
  ADD COLUMN session_id    VARCHAR(36),
  ADD COLUMN archived_at   TIMESTAMPTZ,
  ADD COLUMN deleted_at    TIMESTAMPTZ,
  ADD COLUMN deleted_by    VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_audit_logs_category    ON audit_logs (category);
CREATE INDEX IF NOT EXISTS ix_audit_logs_severity    ON audit_logs (severity);
CREATE INDEX IF NOT EXISTS ix_audit_logs_company_id  ON audit_logs (company_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_mill_id     ON audit_logs (mill_id);
CREATE INDEX IF NOT EXISTS ix_audit_logs_deleted_at  ON audit_logs (deleted_at) WHERE deleted_at IS NULL;
```

**Log Categories:**
- `SECURITY` — login, logout, failed login, permission denied, password reset
- `USER_ACTIVITY` — CRUD on employees, machines, suppliers, etc.
- `PRODUCTION` — machine start/stop, breakdown, target miss, efficiency drop
- `INVENTORY` — stock in/out, lot creation, dispatch
- `BILLING` — plan change, invoice, payment, overage
- `SYSTEM` — import, export, API failure

**Log Severity:** `INFO` | `WARNING` | `CRITICAL` | `EMERGENCY`

#### 4.1.2 `audit_log_archive` (New Table)

Same schema as `audit_logs`. Logs older than 90 days are moved here. Purged at 365 days.

```sql
CREATE TABLE audit_log_archive (
  -- identical columns to audit_logs
  id           VARCHAR(36) PRIMARY KEY,
  user_id      VARCHAR(36),
  user_name    VARCHAR(200),
  role         VARCHAR(50),
  action       VARCHAR(50)   NOT NULL,
  entity       VARCHAR(100)  NOT NULL,
  entity_id    VARCHAR(36),
  details      TEXT,
  old_value    TEXT,
  new_value    TEXT,
  ip_address   VARCHAR(50),
  category     VARCHAR(50)   DEFAULT 'USER_ACTIVITY',
  severity     VARCHAR(20)   DEFAULT 'INFO',
  company_id   VARCHAR(36),
  mill_id      VARCHAR(36),
  module       VARCHAR(100),
  session_id   VARCHAR(36),
  archived_at  TIMESTAMPTZ   DEFAULT NOW(),
  created_at   TIMESTAMPTZ   NOT NULL
);
CREATE INDEX ON audit_log_archive (company_id, created_at DESC);
CREATE INDEX ON audit_log_archive (category);
```

#### 4.1.3 `system_alerts` (New Table)

```sql
CREATE TABLE system_alerts (
  id                 VARCHAR(36)   PRIMARY KEY,
  company_id         VARCHAR(36)   NOT NULL  REFERENCES companies(id) ON DELETE CASCADE,
  mill_id            VARCHAR(36)   REFERENCES mills(id) ON DELETE SET NULL,
  category           VARCHAR(50)   NOT NULL,   -- MACHINE|SECURITY|HR|BILLING|INVENTORY|SYSTEM
  level              VARCHAR(20)   NOT NULL,   -- INFO|WARNING|CRITICAL|EMERGENCY
  title              VARCHAR(200)  NOT NULL,
  message            TEXT,
  source_type        VARCHAR(100),             -- machine_breakdown|failed_login|low_stock|trial_ending
  source_id          VARCHAR(36),              -- ID of triggering entity
  source_data        JSONB         DEFAULT '{}',
  status             VARCHAR(20)   DEFAULT 'OPEN',  -- OPEN|ACKNOWLEDGED|ESCALATED|RESOLVED
  target_role        VARCHAR(50),              -- initial target role
  acknowledged_by    VARCHAR(36)   REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at    TIMESTAMPTZ,
  resolved_by        VARCHAR(36)   REFERENCES users(id) ON DELETE SET NULL,
  resolved_at        TIMESTAMPTZ,
  escalation_count   INTEGER       DEFAULT 0,
  next_escalation_at TIMESTAMPTZ,
  is_read_by         JSONB         DEFAULT '{}',    -- {user_id: timestamp}
  created_at         TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX ON system_alerts (company_id, status, created_at DESC);
CREATE INDEX ON system_alerts (category, level);
CREATE INDEX ON system_alerts (mill_id, status) WHERE mill_id IS NOT NULL;
CREATE INDEX ON system_alerts (next_escalation_at) WHERE status = 'OPEN';
```

#### 4.1.4 `escalation_policies` (New Table)

```sql
CREATE TABLE escalation_policies (
  id               VARCHAR(36)   PRIMARY KEY,
  company_id       VARCHAR(36)   REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = default policy
  category         VARCHAR(50)   NOT NULL,
  level            VARCHAR(20)   NOT NULL,
  step             INTEGER       NOT NULL,   -- 1, 2, 3...
  target_role      VARCHAR(50)   NOT NULL,
  delay_minutes    INTEGER       NOT NULL   DEFAULT 30,
  is_active        BOOLEAN       DEFAULT TRUE,
  UNIQUE (company_id, category, level, step)
);
```

**Default Escalation Policies (seeded):**

| Category | Level | Step | Role | Delay |
|----------|-------|------|------|-------|
| MACHINE | CRITICAL | 1 | MACHINE_OPERATOR | 0 min |
| MACHINE | CRITICAL | 2 | SUPERVISOR | 15 min |
| MACHINE | CRITICAL | 3 | PRODUCTION_MANAGER | 30 min |
| MACHINE | CRITICAL | 4 | GENERAL_MANAGER | 60 min |
| MACHINE | CRITICAL | 5 | MILL_OWNER | 120 min |
| MACHINE | EMERGENCY | 1 | SUPERVISOR | 0 min |
| MACHINE | EMERGENCY | 2 | PRODUCTION_MANAGER | 10 min |
| MACHINE | EMERGENCY | 3 | MILL_OWNER | 20 min |
| SECURITY | CRITICAL | 1 | GENERAL_MANAGER | 0 min |
| SECURITY | CRITICAL | 2 | MILL_OWNER | 15 min |
| SECURITY | EMERGENCY | 1 | MILL_OWNER | 0 min |
| SECURITY | EMERGENCY | 2 | SUPER_ADMIN | 10 min |
| BILLING | WARNING | 1 | MILL_OWNER | 0 min |
| HR | WARNING | 1 | HR_MANAGER | 0 min |
| HR | WARNING | 2 | GENERAL_MANAGER | 60 min |
| INVENTORY | WARNING | 1 | STORE_MANAGER | 0 min |
| INVENTORY | CRITICAL | 2 | GENERAL_MANAGER | 30 min |

#### 4.1.5 `notifications` (New Table)

```sql
CREATE TABLE notifications (
  id           VARCHAR(36)   PRIMARY KEY,
  company_id   VARCHAR(36)   NOT NULL  REFERENCES companies(id) ON DELETE CASCADE,
  user_id      VARCHAR(36)   NOT NULL  REFERENCES users(id) ON DELETE CASCADE,
  alert_id     VARCHAR(36)   REFERENCES system_alerts(id) ON DELETE SET NULL,
  title        VARCHAR(200)  NOT NULL,
  body         TEXT,
  category     VARCHAR(50),                    -- mirrors alert category
  module       VARCHAR(100),
  icon         VARCHAR(50),
  action_url   VARCHAR(500),                   -- deep link e.g. /production/machines/RF-01
  priority     VARCHAR(20)   DEFAULT 'MEDIUM', -- LOW|MEDIUM|HIGH|URGENT
  is_read      BOOLEAN       DEFAULT FALSE,
  is_archived  BOOLEAN       DEFAULT FALSE,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  read_at      TIMESTAMPTZ
);
CREATE INDEX ON notifications (user_id, is_read, created_at DESC);
CREATE INDEX ON notifications (company_id, created_at DESC);
CREATE INDEX ON notifications (user_id, is_archived, created_at DESC);
```

#### 4.1.6 `usage_snapshots` (New Table)

```sql
CREATE TABLE usage_snapshots (
  id               VARCHAR(36)  PRIMARY KEY,
  company_id       VARCHAR(36)  NOT NULL  REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_date    DATE         NOT NULL,
  active_users     INTEGER      DEFAULT 0,
  total_employees  INTEGER      DEFAULT 0,
  total_machines   INTEGER      DEFAULT 0,
  total_mills      INTEGER      DEFAULT 0,
  imports_count    INTEGER      DEFAULT 0,
  exports_count    INTEGER      DEFAULT 0,
  api_calls_count  INTEGER      DEFAULT 0,
  storage_mb       NUMERIC(10,2) DEFAULT 0,
  created_at       TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (company_id, snapshot_date)
);
CREATE INDEX ON usage_snapshots (company_id, snapshot_date DESC);
```

#### 4.1.7 `log_retention_config` (New Table)

```sql
CREATE TABLE log_retention_config (
  id                   VARCHAR(36)  PRIMARY KEY,
  company_id           VARCHAR(36)  REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = global default
  active_days          INTEGER      DEFAULT 90,
  archive_days         INTEGER      DEFAULT 365,
  auto_archive_enabled BOOLEAN      DEFAULT TRUE,
  auto_purge_enabled   BOOLEAN      DEFAULT TRUE,
  updated_by           VARCHAR(36)  REFERENCES users(id),
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);
-- Seed global default:
INSERT INTO log_retention_config (id, active_days, archive_days) 
VALUES ('global-default', 90, 365)
ON CONFLICT DO NOTHING;
```

---

### 4.2 New SQLAlchemy Models

**File:** `backend/app/models/alerts.py`

```python
class SystemAlert(Base):
    __tablename__ = "system_alerts"
    # all fields as above
    # add relationships: company, mill, acknowledged_by_user, resolved_by_user

class EscalationPolicy(Base):
    __tablename__ = "escalation_policies"

class Notification(Base):
    __tablename__ = "notifications"
    # add relationship: user, alert

class UsageSnapshot(Base):
    __tablename__ = "usage_snapshots"

class LogRetentionConfig(Base):
    __tablename__ = "log_retention_config"
```

**File:** `backend/app/models/audit.py` — extend `AuditLog` with new columns

---

### 4.3 New Backend Services

#### `backend/app/services/alert_service.py`

```python
class AlertService:
    async def create_alert(
        company_id, mill_id, category, level, title, message,
        source_type, source_id, source_data, target_role
    ) -> SystemAlert

    async def acknowledge_alert(alert_id, user_id) -> SystemAlert
    async def resolve_alert(alert_id, user_id) -> SystemAlert
    async def get_company_alerts(company_id, mill_id, filters) -> List[SystemAlert]
    async def get_alert_stats(company_id) -> dict
    async def run_escalation_pass() -> int  # returns count escalated
    
    # Alert evaluation methods
    async def evaluate_machine_alerts(company_id) -> None
    async def evaluate_security_alerts(company_id) -> None
    async def evaluate_billing_alerts(company_id) -> None
    async def evaluate_hr_alerts(company_id) -> None
    async def evaluate_inventory_alerts(company_id) -> None
```

#### `backend/app/services/notification_service.py`

```python
class NotificationService:
    async def create_notification(user_id, company_id, alert_id, title, body, ...) -> Notification
    async def notify_role(company_id, mill_id, role_code, title, body, alert_id, ...) -> int
    async def get_user_notifications(user_id, page, page_size, unread_only) -> List
    async def get_unread_count(user_id) -> int
    async def mark_read(notification_id, user_id) -> bool
    async def mark_all_read(user_id) -> int
    async def archive(notification_id, user_id) -> bool
    async def push_via_websocket(user_id, payload) -> None  # uses ConnectionManager
```

#### `backend/app/services/log_service.py` (extends existing audit logging)

```python
async def log_security_event(db, user_id, action, ip, details, severity) -> AuditLog
async def archive_old_logs(db) -> int  # moves logs older than config to archive
async def purge_archive(db) -> int     # deletes archive older than config
async def download_logs(db, company_id, filters, format) -> bytes
```

#### `backend/app/services/usage_service.py`

```python
class UsageService:
    async def take_snapshot(company_id) -> UsageSnapshot
    async def get_current_usage(company_id) -> dict  # vs plan limits
    async def check_limits(company_id) -> dict        # {resource: {used, limit, pct, over}}
    async def snapshot_all_companies() -> int
```

---

### 4.4 API Endpoints

#### Enhanced Audit Log API (`/audit/`)

```
GET  /audit/logs
     ?category=SECURITY
     &severity=CRITICAL
     &company_id=...      (SUPER_ADMIN only)
     &mill_id=...
     &module=production
     &user_id=...
     &ip_address=...
     &date_from=...
     &date_to=...
     &include_deleted=false
     → {data: AuditLog[], total, page, per_page}

GET  /audit/logs/download
     ?format=csv|excel|pdf
     &date_from=...&date_to=...
     &category=...&user_id=...&severity=...
     → file download (Content-Disposition: attachment)

GET  /audit/logs/stats
     → {by_category: {...}, by_severity: {...}, today_count, week_count}

POST /audit/logs/{id}/soft-delete      [SUPER_ADMIN only]
DELETE /audit/logs/{id}                [SUPER_ADMIN only, hard delete]
POST /audit/logs/bulk-soft-delete      [SUPER_ADMIN, body: {ids: [...]}]

GET  /audit/archive                    [SUPER_ADMIN]
     same filters as /audit/logs
```

#### Alert API (`/alerts/`)

```
GET  /alerts
     ?category=MACHINE&level=CRITICAL&status=OPEN&mill_id=...
     &date_from=...&date_to=...&page=1&page_size=50
     → {data: Alert[], total, unresolved_count}

GET  /alerts/{id}
     → Alert (with escalation history)

POST /alerts/{id}/acknowledge
     → Alert

POST /alerts/{id}/resolve
     body: {notes?: string}
     → Alert

GET  /alerts/stats
     → {open_by_level: {...}, open_by_category: {...}, escalated: N}

# SUPER_ADMIN views all companies
GET  /admin/alerts
     ?company_id=...  (optional filter)
     → same as above but cross-company

GET  /admin/alerts/stats
     → {total_open, critical, emergency, by_company: [...]}

# Admin creates manual alert
POST /admin/alerts
     body: {company_id, mill_id, category, level, title, message}
```

#### Notification API (`/notifications/`)

```
GET  /notifications
     ?unread_only=false&category=...&page=1&page_size=50
     → {data: Notification[], total, unread_count}

GET  /notifications/unread-count
     → {count: N}

POST /notifications/{id}/read
     → {ok: true}

POST /notifications/read-all
     → {marked: N}

POST /notifications/{id}/archive
     → {ok: true}

DELETE /notifications/{id}
     → {ok: true}
```

#### Usage API (`/billing/usage`)

```
GET  /billing/usage
     → {
         plan: {name, code, limits: {users, mills, employees}},
         usage: {
           users:     {used: N, limit: N, pct: %, over: bool},
           mills:     {used: N, limit: N, pct: %, over: bool},
           employees: {used: N, limit: N, pct: %, over: bool}
         },
         alerts: [{resource, message, severity}]
       }

GET  /admin/billing/usage/{company_id}   [SUPER_ADMIN]
     → same structure

GET  /admin/billing/usage-report         [SUPER_ADMIN]
     → {companies: [{name, usage_summary, overage_flags}]}
```

#### Report API additions (`/reports/`)

```
GET  /reports/alerts
     ?date_from=...&date_to=...&category=...&level=...
     → alert summary report (PDF or JSON)

GET  /reports/security
     ?date_from=...&date_to=...
     → {failed_logins, permission_denials, lockouts, suspicious_ips: [...]}

GET  /reports/usage
     ?month=2026-06
     → monthly usage report per module

GET  /reports/audit-summary
     ?date_from=...&date_to=...&category=...
     → aggregate counts, top actors, anomalies
```

---

### 4.5 Background Jobs Architecture

Extend the existing `_expiry_loop` pattern in `main.py` lifespan. No APScheduler needed on Render free tier.

```python
# In lifespan, after yield:
async def _enterprise_loop():
    """Runs all periodic enterprise jobs on staggered intervals."""
    tick = 0
    while True:
        try:
            async for session in get_db():
                # Every 5 min: alert evaluation + escalation
                if tick % 5 == 0:
                    from app.services.alert_service import AlertService
                    svc = AlertService(session)
                    for company in await get_all_active_companies(session):
                        await svc.evaluate_billing_alerts(company.id)
                        await svc.evaluate_machine_alerts(company.id)
                    await svc.run_escalation_pass()

                # Every 60 min: usage snapshots
                if tick % 60 == 0:
                    from app.services.usage_service import UsageService
                    await UsageService(session).snapshot_all_companies()

                # Every 24h (at tick 1440): log archive
                if tick % 1440 == 0:
                    from app.services.log_service import archive_old_logs, purge_archive
                    await archive_old_logs(session)
                    await purge_archive(session)

                await session.commit()
                break
        except Exception as exc:
            logger.error(f"Enterprise loop error at tick {tick}: {exc}", exc_info=True)

        await asyncio.sleep(60)  # 1-minute base tick
        tick += 1

enterprise_task = asyncio.create_task(_enterprise_loop())
```

---

### 4.6 Alert Evaluation Logic

#### Machine Alerts

```python
async def evaluate_machine_alerts(self, company_id: str) -> None:
    """Check recent production data for machine alert conditions."""
    
    # Condition 1: Machine breakdown (stoppage with type=breakdown in last 2h)
    # → level=CRITICAL, source_type=machine_breakdown
    
    # Condition 2: Machine idle > 1h (no production entry but shift is active)
    # → level=WARNING, source_type=machine_idle
    
    # Condition 3: Efficiency < 70% in last 2 entries
    # → level=WARNING, source_type=efficiency_drop
    
    # Condition 4: Production target < 60% of shift target
    # → level=WARNING, source_type=target_miss
    
    # Condition 5: Waste % > 5% in last entry
    # → level=WARNING, source_type=excess_waste
    
    # Deduplication: don't create duplicate OPEN alerts for same source
    # Check: SELECT 1 FROM system_alerts 
    #        WHERE company_id=? AND source_type=? AND source_id=? AND status='OPEN'
```

#### Security Alerts

```python
# Triggered from auth.py on failed login:
async def on_failed_login(user_id, ip_address, attempt_count):
    if attempt_count >= 3:
        await AlertService.create_alert(
            category="SECURITY", level="WARNING",
            title="Multiple failed login attempts",
            source_type="failed_login", source_data={"ip": ip_address, "attempts": attempt_count}
        )
    if attempt_count >= 5:
        # Escalate to CRITICAL, trigger account lockout alert
        await AlertService.create_alert(level="CRITICAL", ...)

# Triggered from access.py on permission denied:
async def on_permission_denied(user_id, module, action):
    # Only create alert if > 3 denials in 1h for same user
    pass
```

#### Billing Alerts (run in billing evaluation loop)

```python
# Trial ending in 3 days
if sub.trial_ends_at and (sub.trial_ends_at - now).days <= 3:
    create_alert(level="WARNING", source_type="trial_ending", ...)

# Subscription expiring in 7 days
if sub.expires_at and (sub.expires_at - now).days <= 7:
    create_alert(level="CRITICAL", source_type="subscription_expiring", ...)

# Usage over 90% of limit
if usage_pct >= 90:
    create_alert(level="WARNING", source_type="usage_limit_warning", ...)

# Usage at 100% (over limit)
if usage_pct >= 100:
    create_alert(level="CRITICAL", source_type="plan_limit_exceeded", ...)
```

---

### 4.7 Notification Delivery Flow

```
Event occurs (e.g. machine breakdown)
    ↓
AlertService.create_alert()
    ↓
Determine target_role from EscalationPolicy (step=1, delay=0)
    ↓
NotificationService.notify_role(company_id, mill_id, target_role, ...)
    ↓
  ├─ Create `notifications` row per matching user
  ├─ Push via WebSocket: manager.send_to_user(user_id, {type: "notification", ...})
  └─ (Future) send email via email service
    ↓
If not acknowledged in delay_minutes:
    EscalationService escalates to next step
    Creates new notifications for next role
```

---

### 4.8 Frontend Architecture

#### New Pages / Components

```
src/routes/
  _app.notifications.tsx          — Notification center page
  _app.alerts.tsx                 — Alert management page
  _app.audit.tsx                  — Enhanced audit log page (add download, severity filter)
  _app.admin.alerts.tsx           — SUPER_ADMIN cross-company alerts

src/components/
  notifications/
    NotificationBell.tsx          — Header bell icon with unread count badge
    NotificationDropdown.tsx      — Quick dropdown (last 5, mark read, see all link)
    NotificationCenter.tsx        — Full page list with filter/archive
  alerts/
    AlertBadge.tsx                — Severity color badge
    AlertList.tsx                 — Filterable alert table
    AlertCard.tsx                 — Single alert with ack/resolve buttons
    AlertStatsWidget.tsx          — Dashboard widget (open by level)
  dashboard/
    PendingActionsWidget.tsx      — "3 alerts need attention" block
    UsageWidget.tsx               — Plan usage bars (users/mills/employees)
```

#### Notification Bell (Header)

```typescript
// Poll /notifications/unread-count every 60s
// Also listen to WebSocket /ws/notifications for real-time push
// Show red badge with count if > 0
// Click → NotificationDropdown with last 5 notifications
// "See all" → /notifications page
```

---

## 5. Implementation Waves

### Wave 4A — Foundation (Days 1–3)
**Goal:** Log enhancement, notification model, P0 bug fixes, basic alert infrastructure

#### Tasks
| # | Task | File(s) | Risk |
|---|------|---------|------|
| 4A-1 | **P0 BUG FIX**: Change request 400 | `billing.py` | Low |
| 4A-2 | Migration 028 — extend audit_logs, add 5 new tables | `028_wave4a_enterprise_foundation.py` | Medium |
| 4A-3 | New SQLAlchemy models (alerts.py) | `models/alerts.py`, `models/__init__.py` | Low |
| 4A-4 | Enhanced AuditLog model + log_audit() helper updated | `models/audit.py`, `core/audit.py` | Low |
| 4A-5 | Enhanced GET /audit/logs (category/severity/company filters) | `api/v1/audit.py` | Low |
| 4A-6 | Log download endpoint (CSV + Excel) | `api/v1/audit.py` | Low |
| 4A-7 | Log soft-delete + hard-delete (SUPER_ADMIN) | `api/v1/audit.py` | Low |
| 4A-8 | Basic NotificationService + 5 CRUD endpoints | `services/notification_service.py`, `api/v1/notifications.py` | Low |
| 4A-9 | Wire NotificationBell to header + unread count | `src/components/notifications/NotificationBell.tsx` | Low |
| 4A-10 | TypeScript build + migration dry-run | CI | Low |

#### Deliverable
- Enhanced audit logs with category/severity
- Log download working
- Notification center (in-app, no push yet)
- Billing change-request bug fixed

---

### Wave 4B — Alert Engine (Days 4–7)
**Goal:** Full alert system, escalation policies, WebSocket push, machine + security + billing alerts

#### Tasks
| # | Task | File(s) | Risk |
|---|------|---------|------|
| 4B-1 | AlertService (create, ack, resolve, stats) | `services/alert_service.py` | Medium |
| 4B-2 | Alert CRUD API (7 endpoints) | `api/v1/alerts.py` | Low |
| 4B-3 | Seed default escalation policies (15 rules) | migration seeder | Low |
| 4B-4 | Escalation engine: `run_escalation_pass()` | `services/alert_service.py` | Medium |
| 4B-5 | Wire alert evaluation to enterprise loop in main.py | `main.py` | Medium |
| 4B-6 | Machine alert evaluation (breakdown, idle, efficiency drop) | `services/alert_service.py` | Medium |
| 4B-7 | Billing alert evaluation (trial ending, expiring, overage) | `services/alert_service.py` | Low |
| 4B-8 | Security alert triggers in auth.py (failed logins) | `api/v1/auth.py` | Medium |
| 4B-9 | WebSocket push on notification create | `services/notification_service.py` | Medium |
| 4B-10 | React: AlertList page + AlertStatsWidget for dashboard | `src/routes/_app.alerts.tsx` | Low |
| 4B-11 | React: NotificationDropdown in header | `src/components/notifications/` | Low |

#### Deliverable
- Live machine breakdown alerts visible in-app within seconds of stoppage being logged
- Billing alerts fire 7 days before expiry
- Security alerts on 3+ failed logins
- Escalation automatically promotes unacknowledged alerts
- WebSocket push delivers notifications to logged-in users instantly

---

### Wave 4C — Billing Completion + Dashboard + Usage (Days 8–10)
**Goal:** Usage tracking, per-role dashboard improvements, billing enforcement hardening

#### Tasks
| # | Task | File(s) | Risk |
|---|------|---------|------|
| 4C-1 | UsageService (snapshot, get_current, check_limits) | `services/usage_service.py` | Low |
| 4C-2 | `GET /billing/usage` endpoint | `api/v1/billing.py` | Low |
| 4C-3 | Wire usage snapshot to enterprise loop (hourly) | `main.py` | Low |
| 4C-4 | Usage widget on billing page (bars: users, mills, employees) | `BillingPortal.tsx` | Low |
| 4C-5 | `GET /admin/billing/usage-report` | `api/v1/billing.py` | Low |
| 4C-6 | Grace period enforcement: block write endpoints 7d post-expiry | `core/deps.py` | High |
| 4C-7 | Pending actions dashboard widget | `dashboard.py`, React | Low |
| 4C-8 | Alert stats widget on dashboard (open by level) | React dashboard | Low |
| 4C-9 | SUPER_ADMIN: cross-company alert view | `api/v1/billing.py` | Low |
| 4C-10 | Log archive background job (daily) | `services/log_service.py`, `main.py` | Low |
| 4C-11 | Inventory alert evaluation (low stock) | `services/alert_service.py` | Medium |
| 4C-12 | HR alert evaluation (absent > X days, payroll pending) | `services/alert_service.py` | Medium |

#### Deliverable
- Live plan usage visible on billing page with color-coded bars
- Grace period locks write operations (not read) 7 days after expiry
- Dashboard shows alert summary + pending action counts
- Log archive job keeping audit_logs clean

---

### Wave 4D — Reports, Security Hardening, Advanced (Days 11–14)
**Goal:** Full reporting suite, email notifications, advanced security alerts, HR alerts

#### Tasks
| # | Task | File(s) | Risk |
|---|------|---------|------|
| 4D-1 | `GET /reports/alerts` (PDF + JSON) | `api/v1/reports.py` | Low |
| 4D-2 | `GET /reports/security` | `api/v1/reports.py` | Low |
| 4D-3 | `GET /reports/usage` (monthly) | `api/v1/reports.py` | Low |
| 4D-4 | `GET /reports/audit-summary` | `api/v1/reports.py` | Low |
| 4D-5 | Email notification on CRITICAL/EMERGENCY alerts | `services/email_service.py` | High |
| 4D-6 | Permission-denied security alerts (in access.py) | `core/access.py` | Medium |
| 4D-7 | Multiple device login detection | `api/v1/auth.py` | Medium |
| 4D-8 | `log_retention_config` UI for SUPER_ADMIN | React admin page | Low |
| 4D-9 | Full notification center page (filter, archive, search) | React | Low |
| 4D-10 | SUPER_ADMIN: alert reports across companies | React admin | Low |

---

## 6. Risk Assessment

### Migration Impact
| Migration | Tables Changed | Risk | Rollback |
|-----------|---------------|------|---------|
| 028 | 1 extended + 5 new | LOW — additive only | `DROP TABLE` new tables, `ALTER TABLE DROP COLUMN` |

The `audit_logs` ALTER TABLE adds nullable columns only. Existing rows get NULL for new columns. No data loss possible.

### Performance Impact
| Component | Impact | Mitigation |
|-----------|--------|------------|
| Alert evaluation loop (5 min) | 1-3 DB queries per company per cycle | Index on source_type+status+company_id. Skip if no active shifts. |
| `GET /notifications` | Full table scan risk on large data | Index on user_id + is_read + created_at; LIMIT enforced |
| `GET /audit/logs/download` | Large result set → OOM risk | Stream response; enforce max 10,000 rows per download |
| Log archive job (daily) | Long-running bulk move | Run in chunks of 500 rows; sleep between chunks |

### Multi-Tenant Isolation Risk
All new tables have `company_id` FK. Every query in AlertService/NotificationService/UsageService filters by `company_id`. SUPER_ADMIN bypass uses explicit `skip_company_check=True` pattern. Risk: **LOW**.

### Security Impact
- Security alert triggers require careful deduplication to avoid alert storms
- Permission-denied alerts could generate high volume if misconfigured — apply per-user rate limit (max 1 alert per user per hour for same type)
- Escalation to SUPER_ADMIN for EMERGENCY security events must be carefully gated

### Supabase Free Tier Constraints
| Concern | Impact | Mitigation |
|---------|--------|-----------|
| 5 new tables | Negligible storage impact | OK |
| Enterprise loop queries | +3-5 conn/cycle | Loop is sequential per company; pool_size=3 sufficient |
| Log download | Single large query | Add `LIMIT 10000` hard cap |

---

## 7. P0 Bug Fixes (Immediate — Before Wave 4A)

### Bug 1: Change Request 400 — "Company has no active subscription"

**File:** `backend/app/api/v1/billing.py` — `create_change_request()` at line ~395

**Root cause:** `SubscriptionChangeRequest.current_plan_id` is a non-nullable FK to `subscription_plans`. If the company has no row in `company_subscriptions`, the code raises 400. New or trial companies often have no subscription row.

**Fix:**
```python
# Replace:
sub = current_sub.scalar_one_or_none()
if not sub:
    raise HTTPException(status_code=400, detail="Company has no active subscription")
change_request = SubscriptionChangeRequest(
    current_plan_id=sub.plan_id,
    ...
)

# With:
sub = current_sub.scalar_one_or_none()
if sub:
    current_plan_id = sub.plan_id
else:
    # Look up by company.plan code (e.g. "starter")
    fallback = await db.execute(
        select(SubscriptionPlan).where(SubscriptionPlan.code == (company.plan or "starter"))
    )
    fallback_plan = fallback.scalar_one_or_none()
    if not fallback_plan:
        fallback = await db.execute(select(SubscriptionPlan).limit(1))
        fallback_plan = fallback.scalar_one_or_none()
    if not fallback_plan:
        raise HTTPException(status_code=400, detail="No subscription plans available. Contact support.")
    current_plan_id = fallback_plan.id

change_request = SubscriptionChangeRequest(
    current_plan_id=current_plan_id,
    ...
)
```

### Bug 2: Render Crash Loop (Migration version mismatch)

**Root cause:** `alembic_version` in production Supabase is behind the actually-applied schema.

**Fix — run this SQL in Supabase SQL editor:**
```sql
-- Step 1: check current version
SELECT * FROM alembic_version;

-- Step 2: check for data issues that would block migrations
SELECT 'machines_null_mill_id' AS check, COUNT(*) FROM machines WHERE mill_id IS NULL
UNION ALL SELECT 'shifts_null_mill_id', COUNT(*) FROM shifts WHERE mill_id IS NULL
UNION ALL SELECT 'warehouses_null_mill_id', COUNT(*) FROM warehouses WHERE mill_id IS NULL
UNION ALL SELECT 'lots_null_mill_id', COUNT(*) FROM lots WHERE mill_id IS NULL;

-- Step 3: fix any NULLs (replace with your mill_id: ac9f8402-dd74-44ba-9356-bf9adde701c1)
-- UPDATE machines SET mill_id = 'ac9f8402-dd74-44ba-9356-bf9adde701c1' WHERE mill_id IS NULL;

-- Step 4: stamp to current revision
UPDATE alembic_version SET version_num = '026';
-- If no row: INSERT INTO alembic_version (version_num) VALUES ('026');
```

**Then push all pending code (after removing git lock files):**
```bash
rm /Users/kannaa/millflow/.git/HEAD.lock /Users/kannaa/millflow/.git/index.lock 2>/dev/null
cd /Users/kannaa/millflow && \
git add backend/app/main.py \
        src/hooks/useMillConfig.ts \
        backend/app/api/v1/admin.py \
        backend/alembic/versions/027_role_module_customization.py \
        backend/app/models/masters.py \
        backend/app/models/__init__.py \
        backend/app/core/access.py \
        "src/routes/_app.admin.companies.\$companyId.tsx" && \
git commit -m "fix(server): crash loop stderr logging; fix(billing): require() crash; feat(roles): role-module customization" && \
git push
```

---

## Summary: Wave 4 Delivery Targets

| Wave | Days | Key Deliverables |
|------|------|-----------------|
| **4A** | 1–3 | Enhanced audit logs, log download, notification model+API, P0 bug fixes |
| **4B** | 4–7 | Full alert engine, escalation, WebSocket push, machine/security/billing alerts live |
| **4C** | 8–10 | Usage tracking, dashboard improvements, grace period enforcement, log archival |
| **4D** | 11–14 | Full reporting suite, email notifications, advanced security alerts, admin controls |

**Total new tables:** 6 (`audit_log_archive`, `system_alerts`, `escalation_policies`, `notifications`, `usage_snapshots`, `log_retention_config`)  
**Total new API endpoints:** ~35  
**Total new services:** 4 (`AlertService`, `NotificationService`, `UsageService`, `LogService`)  
**Total new React components/pages:** ~12  
**Migration:** 028 (additive only, zero breaking changes)

---

*This blueprint is the authoritative implementation reference for Wave 4. No code should be written outside this plan.*

# SpinFlow ERP — FastAPI Backend Scaffold

The frontend is built with **React + TanStack Router**. Run a separate FastAPI service and point the frontend at it via `VITE_API_BASE_URL`. The mock API in `src/lib/mock-api.ts` mirrors the contracts below — swap each function for an axios call when your backend is up.

## Suggested folder structure

```
spinflow-backend/
├── app/
│   ├── main.py                  # FastAPI app, CORS, routers
│   ├── core/
│   │   ├── config.py            # pydantic-settings, env vars
│   │   ├── security.py          # JWT encode/decode, password hashing (bcrypt/argon2)
│   │   ├── deps.py              # get_current_user, get_db
│   │   └── rbac.py              # require_role(), require_module() decorators
│   ├── db/
│   │   ├── base.py              # SQLAlchemy Base
│   │   ├── session.py           # async engine + SessionLocal
│   │   └── seed.py              # demo seed data
│   ├── models/                  # SQLAlchemy ORM
│   │   ├── user.py role.py audit.py
│   │   ├── machine.py shift.py downtime.py
│   │   ├── lot.py inventory.py
│   │   ├── dispatch.py qr_scan.py
│   │   ├── supplier.py purchase.py grn.py
│   │   ├── quality_test.py
│   │   ├── employee.py attendance.py
│   │   └── invoice.py payment.py
│   ├── schemas/                 # Pydantic v2 request/response models
│   ├── repositories/            # data access (one file per aggregate)
│   ├── services/                # business logic, approval workflows
│   ├── api/
│   │   └── v1/
│   │       ├── auth.py          # /login /refresh /logout /me
│   │       ├── users.py
│   │       ├── production.py    # /machines /shifts /downtime
│   │       ├── quality.py inventory.py dispatch.py
│   │       ├── purchase.py stores.py hr.py
│   │       ├── accounts.py maintenance.py
│   │       ├── dashboard.py     # role-aware KPIs
│   │       ├── qr.py            # generate + scan endpoints
│   │       └── audit.py reports.py
│   ├── ws/                      # WebSocket endpoints for realtime
│   │   └── notifications.py
│   └── workers/                 # background jobs (reorder alerts, etc.)
├── alembic/                     # migrations
├── tests/
├── docker-compose.yml           # postgres + api + nginx
├── Dockerfile
├── nginx.conf
└── requirements.txt
```

## Core auth flow

1. `POST /api/v1/auth/login` → returns `{ access_token, refresh_token, user }`. Frontend stores in `useAuth` (Zustand) and attaches `Authorization: Bearer <access_token>` via an axios interceptor.
2. `POST /api/v1/auth/refresh` rotates the refresh token.
3. `Depends(get_current_user)` decodes JWT, loads user + role, attaches to request.
4. `Depends(require_module("production", write=True))` enforces RBAC using the same matrix as `src/lib/rbac.ts`.

## RBAC matrix

Mirror `src/lib/rbac.ts` server-side. Two tables:

```sql
roles(id, code, name)
role_permissions(role_id, module, can_read, can_write, can_approve, can_delete)
```

Seed all 14 roles on startup. Every endpoint declares its module + required level.

## Audit logging

Add an SQLAlchemy event listener on `after_insert`, `after_update`, `after_delete` that writes to `audit_logs(user_id, role, ip, action, entity, entity_id, old_value, new_value, created_at)`. Login/logout written from the auth router.

## Approval workflows

Tables: `approvals(entity_type, entity_id, level, approver_role, approver_user_id, status, decided_at)`. Production entry creates pending rows for SUPERVISOR → PRODUCTION_MANAGER; dispatch for DISPATCH_MANAGER → GM; purchase for PURCHASE → ACCOUNTS → OWNER.

## QR system

`POST /api/v1/qr/generate { entity_type, entity_id }` returns payload + signed token. `POST /api/v1/qr/scan { token, station }` writes to `qr_scans(token, entity, station, scanned_by, scanned_at)`. Use the same token at packing, loading, gate exit to build the movement timeline.

## WebSockets

`/ws/notifications` — JWT-authenticated. Push events: `machine.breakdown`, `stock.low`, `quality.rejected`, `dispatch.pending`, `target.miss`. Frontend can subscribe with native `WebSocket` and dispatch into React Query cache.

## Connecting the frontend

```ts
// src/lib/api.ts (when you wire real backend)
import axios from "axios";
import { useAuth } from "@/stores/auth";

export const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL });
api.interceptors.request.use((cfg) => {
  const t = useAuth.getState().token;
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});
```

Then replace functions in `src/lib/mock-api.ts` one by one:

```ts
export const getShifts = () => api.get("/api/v1/production/shifts").then(r => r.data);
```

## Deploy (Docker / Nginx / Ubuntu)

`docker-compose up -d` brings up postgres + api. Nginx terminates TLS, proxies `/api` → FastAPI, serves the built frontend (`bun run build` output) as static. Use Certbot for HTTPS.

## v1 status

- ✅ Auth UI + Zustand store + JWT-ready interceptor pattern
- ✅ 14-role RBAC matrix (front + ready for back)
- ✅ App shell, role-filtered sidebar, dashboard
- ✅ Production module (machines, shifts, downtime) end-to-end against mock API
- 🚧 Quality, Inventory, Dispatch, Purchase, Stores, HR, Accounts, Maintenance, Users, Audit — stubs with access control wired

Build each remaining module — the patterns from Production carry over.

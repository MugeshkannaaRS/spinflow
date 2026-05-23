# SpinFlow ERP

**Production-grade Spinning Mill Enterprise Resource Planning System**

A comprehensive ERP platform for the textile spinning mill industry. Manage production, quality, dispatch, inventory, HR, accounts, and maintenance — all in one place with role-based access, QR-based lot traceability, real-time dashboards, and audit trails.

---

## Tech Stack

### Frontend
- React 19 + TypeScript
- TanStack Router + React Query
- Tailwind CSS v4 + shadcn/ui
- Zustand (state management)
- Recharts (dashboards & analytics)
- Lucide React (icons)

### Backend
- FastAPI (Python 3.12)
- SQLAlchemy 2.0 (async ORM)
- PostgreSQL 16
- Redis 7 (caching + sessions)
- JWT Authentication + Refresh Tokens
- WebSockets (real-time notifications)

### Infrastructure
- Docker & Docker Compose
- Nginx (reverse proxy + SSL)
- PWA-ready (offline support)

---

## Quick Start

```bash
# Development (frontend only with mock data)
npm install
npm run dev

# Full stack with Docker
docker compose up -d --build
```

### Demo Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | admin@spinflow.in | demo |
| Mill Owner | owner@spinflow.in | demo |
| General Manager | gm@spinflow.in | demo |
| Production Manager | production@spinflow.in | demo |
| Quality Manager | quality@spinflow.in | demo |

---

## Modules

| Module | Features |
|---|---|
| **Dashboard** | Role-based KPIs, charts, activity feed |
| **Production** | Shift entries, machine efficiency, downtime tracking, waste analysis |
| **Quality** | CSP/Count/Moisture/Uster testing, lot approval workflow, rejection analysis |
| **Inventory** | Lot tracking, godown stock, stock transfers, ageing reports |
| **Dispatch** | Sales orders, vehicle loading, QR scanning, e-way bill, dispatch register |
| **Purchase** | Supplier management, bale purchase, moisture recording, GRN |
| **Stores** | Spare inventory, reorder alerts, issue notes, vendor management |
| **HR** | Attendance, leave management, employee directory, shift allocation |
| **Accounts** | GST invoices, sales/purchase register, receivables tracking |
| **Maintenance** | Breakdown logging, preventive maintenance, technician tracking, MTTR/MTBF |
| **Users & Roles** | User management, role assignment, 14-role RBAC |
| **Audit Logs** | Complete action trail, IP tracking, old/new value comparison |
| **Reports** | Cross-module KPIs, production/quality/dispatch/financial summaries |

---

## RBAC (14 Roles)

1. **Super Admin** — Full access
2. **Mill Owner** — Read-only + financial dashboard + approvals
3. **General Manager** — All operational modules + approvals
4. **Production Manager** — Production + quality (read) + inventory (read)
5. **Quality Manager** — Quality + production (read) + inventory (read)
6. **Dispatch Manager** — Dispatch + inventory (read)
7. **Store Manager** — Stores + inventory + purchase (read)
8. **HR Manager** — HR + reports
9. **Accountant** — Accounts + purchase/dispatch (read)
10. **Maintenance Manager** — Maintenance + stores (read) + production (read)
11. **Supervisor** — Production entry + department view
12. **Machine Operator** — Machine production + stoppage
13. **Security Gate** — Gate entry + dispatch (read) + QR verification
14. **Auditor** — Read-only access to all modules

---

## QR Traceability System

1. **Generate** — QR created for lots, dispatches, vehicles
2. **Pack** — Scan at packing station
3. **Load** — Scan during vehicle loading
4. **Gate** — Scan at gate exit
5. **Track** — Full movement history with timestamps

---

## Project Structure

```
spinflow-erp/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── core/             # Config, security, RBAC, deps
│   │   ├── db/               # Session, Base, seed
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── api/v1/           # REST API routers
│   │   ├── ws/               # WebSocket notifications
│   │   └── workers/          # Background tasks
│   ├── alembic/              # Database migrations
│   └── requirements.txt
├── src/                      # React frontend
│   ├── components/           # UI components
│   ├── lib/                  # Mock API, RBAC, API service
│   ├── routes/               # Page routes
│   └── stores/               # Zustand stores
├── docker-compose.yml
├── Dockerfile.frontend
├── nginx.conf
└── DEPLOYMENT.md
```

---

## API Documentation

When backend is running:
- Swagger UI: `http://localhost:8000/api/docs`
- ReDoc: `http://localhost:8000/api/redoc`

---

## License

MIT

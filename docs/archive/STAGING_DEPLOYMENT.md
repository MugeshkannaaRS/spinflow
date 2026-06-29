# SpinFlow ERP — Staging Environment Deployment Guide

> **Version:** 1.0.0  
> **LR-1 Verdict:** GO (26/26 workflows passed)  
> **Fresh install target:** Supabase (PostgreSQL) + Render (Backend + Frontend)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Render                         │
│  ┌─────────────────┐  ┌──────────────────────┐  │
│  │  Backend (Web)   │  │  Frontend (Static)   │  │
│  │  uvicorn:8000    │  │  nginx:4173          │  │
│  │  health: /api/   │  │  api→ backend        │  │
│  └────────┬────────┘  └──────────────────────┘  │
│           │                                     │
└───────────┼─────────────────────────────────────┘
            │
┌───────────┴─────────────────────────────────────┐
│              Supabase (PostgreSQL)                │
│  db.[ref].supabase.co:6543                       │
│  Built-in: Auth, Storage, Auto-backup            │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

- [Supabase account](https://supabase.com) (free tier is sufficient)
- [Render account](https://render.com) (free tier for staging)
- [Razorpay test account](https://razorpay.com) (for payment testing)
- [SendGrid](https://sendgrid.com) or any SMTP provider (for email)

---

## Step 1 — Create Supabase Staging Project

1. Log in to [Supabase Dashboard](https://app.supabase.com)
2. Click **New project**
3. Fill in:
   - **Name:** `spinflow-staging`
   - **Database password:** Generate a strong password (save it)
   - **Region:** Choose closest to your users (e.g., `Singapore` for Asia)
   - **Pricing plan:** Free tier
4. Click **Create new project** (takes ~2 minutes)
5. Once created, go to **Project Settings → Database**
6. Copy the **Connection string (URI)** — you'll need it for `DATABASE_URL`
7. Note the **Host** (`db.[ref].supabase.co`) and **Password**

> **Important:** Enable the following in Supabase Dashboard:
> - **Authentication → Settings → SMTP Settings** (optional, for password reset emails)
> - **Storage → Create a bucket** named `uploads` (public)

---

## Step 2 — Deploy Backend to Render

### 2a. Using Render Blueprint (Recommended)

```bash
# Install Render CLI
npm install -g @render/cli

# Authenticate
render login

# Launch from blueprint
render blueprint launch \
  --name spinflow-staging \
  --file render.yaml
```

This deploys both backend and frontend services automatically. Then skip to Step 2c.

### 2b. Manual Deployment

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **New + → Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `spinflow-staging-backend`
   - **Branch:** `main` (or staging branch)
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --loop asyncio`
   - **Health Check Path:** `/api/health`

### 2c. Set Environment Variables

| Variable | Source | Example |
|----------|--------|---------|
| `DATABASE_URL` | Supabase connection string (async) | `postgresql+asyncpg://postgres:...@db.[ref].supabase.co:6543/postgres` |
| `DATABASE_SYNC_URL` | Same but sync port 5432 | `postgresql://postgres:...@db.[ref].supabase.co:5432/postgres` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` | 64-char hex |
| `REFRESH_SECRET_KEY` | Same command (different value) | 64-char hex |
| `REDIS_URL` | Render Redis or Upstash | `redis://...` |
| `QR_SECRET_KEY` | 32+ char random string | — |
| `DEBUG` | `false` | — |
| `CORS_ORIGINS` | Frontend URL | `https://spinflow-staging-frontend.onrender.com` |
| `CORS_ORIGIN_REGEX` | Render subdomain regex | `^https://(.*\.onrender\.com)$` |
| `SMTP_HOST` | Your SMTP provider | `smtp.sendgrid.net` |
| `SMTP_USER` | SMTP username | `apikey` |
| `SMTP_PASSWORD` | SMTP password / API key | — |
| `RAZORPAY_KEY_ID` | Razorpay test key | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | Razorpay test secret | — |
| `RAZORPAY_WEBHOOK_SECRET` | Random string for webhook signing | — |
| `SENTRY_DSN` | Sentry project DSN (optional) | — |

For `DATABASE_URL`, replace spaces with `%20` if your password contains special characters.

### 2d. Provision Redis

1. Render Dashboard → **New + → Redis**
2. Name: `spinflow-staging-redis`
3. Copy the **Internal Connection String** — use this as `REDIS_URL`

---

## Step 3 — Deploy Frontend to Render

### 3a. Static Site

1. Render Dashboard → **New + → Static Site**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `spinflow-staging-frontend`
   - **Branch:** `main`
   - **Build Command:** `npm ci && npm run build`
   - **Publish Directory:** `./dist`
4. Set environment variable:
   - `VITE_API_BASE_URL` = `https://spinflow-staging-backend.onrender.com`
5. Click **Create Static Site**

### 3b. Update CORS

After frontend deploys, copy its URL (e.g., `https://spinflow-staging-frontend.onrender.com`) and add it to the backend's `CORS_ORIGINS` env var. Then **Deploy** the backend again.

---

## Step 4 — Database Migrations

Once the backend is deployed but before seeding:

```bash
# SSH into the backend shell via Render Dashboard,
# or run via Python shell in the backend service

# Run Alembic migrations
alembic upgrade head
```

If Alembic fails (e.g., fresh Supabase has `pgcrypto` extension issues):

```bash
# Run SQL migrations directly via Supabase SQL Editor
# Execute each file in sql/ in order:
#   001 → 002 → 003 → 004 → 005 → 006 → 007 → 008 → 009
```

Open Supabase Dashboard → **SQL Editor** → paste and run each migration.

---

## Step 5 — Seed Foundational Data

```bash
# Seed roles, plans, ModulePricing, and admin user
python -m scripts.seed_staging
```

This creates:
- 14 roles (SUPER_ADMIN, MILL_OWNER, etc.)
- 5 plans (Starter, Growth, Business, Enterprise, Custom) with ModulePricing
- 1 admin user (`admin@mill.spinflow` / `Admin@1234`)

---

## Step 6 — Seed Pilot Dataset (Optional)

For realistic test data with 396K rows:

```bash
python -m scripts.seed_pilot --force
```

This creates 1 company (SF001), 3 mills, 50 users, 1000 employees, production data, attendance, payroll, etc.

---

## Step 7 — Verify Deployment

```bash
# Run the staging verification script
python -m scripts.verify_staging
```

Expected output:
```
  [PASS] database_reachable
  [PASS] table_users
  [PASS] table_companies
  [PASS] role_SUPER_ADMIN
  ...
  [PASS] invoice_generate
  [PASS] payment_reconcile
  ...
  Results: 30+ passed, 0 failed
  Verdict: PASS
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | — | Async PostgreSQL connection string |
| `DATABASE_SYNC_URL` | Yes | — | Sync PostgreSQL connection string |
| `SECRET_KEY` | Yes | — | JWT signing key (≥32 chars) |
| `REFRESH_SECRET_KEY` | Yes | — | Refresh token key (≥32 chars) |
| `REDIS_URL` | Yes | — | Redis connection string |
| `QR_SECRET_KEY` | Yes | — | QR code signing key |
| `DEBUG` | No | `false` | Debug mode |
| `ENVIRONMENT` | No | `development` | Environment name |
| `CORS_ORIGINS` | No | `http://localhost:5173,...` | Allowed CORS origins |
| `CORS_ORIGIN_REGEX` | No | — | CORS origin regex |
| `SMTP_HOST` | No | — | SMTP server host |
| `SMTP_PORT` | No | `587` | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASSWORD` | No | — | SMTP password |
| `RAZORPAY_KEY_ID` | No | — | Razorpay API key |
| `RAZORPAY_KEY_SECRET` | No | — | Razorpay API secret |
| `RAZORPAY_WEBHOOK_SECRET` | No | — | Webhook signing secret |
| `SENTRY_DSN` | No | — | Sentry project DSN |
| `VITE_API_BASE_URL` | Yes (frontend) | — | Backend API URL |

---

## Rollback Steps

### Database Rollback

```bash
# Alembic downgrade one step
alembic downgrade -1

# Or to revert all
alembic downgrade base
```

### Full reset

```bash
# WARNING: Destroys ALL data
# Delete all tables and re-run migrations
drop schema public cascade;
create schema public;
alembic upgrade head
python -m scripts.seed_staging
```

### Render Rollback

1. Render Dashboard → Service → **Deploy History**
2. Find the last known-good deploy
3. Click **Deploy** → **Rollback to this deploy**

### Supabase Rollback

Supabase does not support point-in-time recovery on free tier. To fully reset:
1. Supabase Dashboard → **Database → Delete project**
2. Create a new project and re-run Steps 4–7

---

## Verification Checklist

| # | Check | Expected | Status |
|---|-------|----------|--------|
| 1 | Database reachable | `SELECT 1` returns 1 | ☐ |
| 2 | All tables exist | 25+ tables present | ☐ |
| 3 | Roles seeded | 14 roles (SUPER_ADMIN, MILL_OWNER, ...) | ☐ |
| 4 | Plans seeded | 5 plans (starter, growth, business, enterprise, custom) | ☐ |
| 5 | Admin user exists | `admin@mill.spinflow` can log in | ☐ |
| 6 | Backend health check | `GET /api/health` returns 200 | ☐ |
| 7 | Frontend loads | Homepage renders without errors | ☐ |
| 8 | Company suspend→reactivate | Status transitions work | ☐ |
| 9 | Company archive→restore | Archived company can be restored | ☐ |
| 10 | Invoice generation | Subscription invoice created | ☐ |
| 11 | Payment reconcile | Payment marked paid | ☐ |
| 12 | Permission guards | MILL_OWNER blocked from other company | ☐ |
| 13 | Permission guards | MACHINE_OPERATOR blocked from billing | ☐ |
| 14 | Audit logging | Audit entries created with nullable user_id | ☐ |
| 15 | CORS | Frontend can call backend API | ☐ |
| 16 | Login flow | `admin@mill.spinflow` / `Admin@1234` works | ☐ |

---

## URLs

| Service | URL |
|---------|-----|
| **Frontend** | `https://spinflow-staging-frontend.onrender.com` |
| **Backend API** | `https://spinflow-staging-backend.onrender.com` |
| **API Docs** | `https://spinflow-staging-backend.onrender.com/docs` |
| **Health Check** | `https://spinflow-staging-backend.onrender.com/api/health` |

---

## Health Score

| Metric | Score |
|--------|-------|
| LR-1 Workflows | 26/26 passed |
| Backend Tests | 306/306 passed |
| Slow Queries | 1 (invoice generation: 1115ms) |
| Known Issues | 0 (post-LR-1 fixes applied) |

> **Note:** The invoice generation slow query (1115ms) is a known item. See `backend/app/services/billing_invoice_service.py:generate_subscription_invoice()` for optimization opportunities.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Backend crashes on startup | Missing `SECRET_KEY` or `DATABASE_URL` | Check env vars are set correctly |
| `column "status" does not exist` | Migration 008 not applied | Run `sql/008_company_lifecycle.sql` |
| `audit_logs_user_id_fkey` violation | Old code still using `user_id="SYSTEM"` | Ensure `billing_invoice_service.py` uses `user_id=None` |
| Frontend shows blank page | CORS misconfigured | Update `CORS_ORIGINS` with correct frontend URL |
| Login returns 401 | Wrong `SECRET_KEY` or token expired | Verify `SECRET_KEY` matches across deploys |
| Redis connection refused | Redis not provisioned or wrong URL | Check Render Redis dashboard for connection string |
| Seed fails with FK violation | Migration not run before seed | Run `alembic upgrade head` first |

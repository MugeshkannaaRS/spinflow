# Staging Environment — SpinFlow ERP

## Why Staging?

Staging is a fully isolated copy of SpinFlow for testing migrations, deploys, and new features before they reach production. A bad migration or broken deploy hits staging data — not real customers.

## Branch Model

- `main` → **Production** (automatic deploy via Render)
- `dev` → **Staging** (automatic deploy on push, CI must pass)

Never push directly to `main`. Always merge `dev → main` after staging is verified.

## Setup Steps

### 1. Create Staging Supabase Project

- Go to [supabase.com/dashboard](https://supabase.com/dashboard) → New project
- Choose **free tier** (region closest to you)
- Note the **Database URL** (`db.<ref>.supabase.co`) and **password**
- Copy `Anon Key` and `Project URL` from Settings → API

### 2. Configure `backend/.env.staging`

```
cp backend/.env.staging backend/.env.staging.local
```

Fill in:
- `<STAGING_PROJECT_REF>` — your Supabase project ref
- `<STAGING_DB_PASSWORD>` — the password you set
- `<generate-another-256-bit-hex>` — run `python -c "import secrets; print(secrets.token_hex(32))"`
- `<staging-anon-key>` — from Supabase API settings
- `SUPABASE_URL` — `https://<ref>.supabase.co`

### 3. Deploy Staging on Render

Use the staging blueprint:

```
render blueprint launch --file render.staging.yaml
```

Or create services manually:
- **Web Service** (backend): `spinflow-backend-staging` — enter secrets via Render dashboard
- **Static Site** (frontend): `spinflow-frontend-staging`

### 4. Add GitHub Secret

In GitHub repo → Settings → Secrets and variables → Actions → New repository secret:

```
Name: RENDER_STAGING_DEPLOY_HOOK
Value: (from Render Dashboard → backend service → Settings → Deploy Hook)
```

### 5. First Deploy

Push to `dev` branch. CI runs backend + frontend checks, then triggers the staging deploy hook.

## Manual Migrations on Staging

SSH into the staging backend container (Render Shell) or run locally:

```bash
cd backend
python scripts/setup_staging.py         # full setup (migrations + seed)
python scripts/setup_staging.py --skip-seed  # schema only
```

Or run Alembic directly:

```bash
cd backend
ENVIRONMENT=staging alembic upgrade head
```

## Quick Reference

| Resource | Production | Staging |
|----------|-----------|---------|
| Supabase | prod project | separate staging project |
| Backend  | spinflow-backend | spinflow-backend-staging |
| Frontend | spinflow-frontend | spinflow-frontend-staging |
| Branch   | main | dev |
| CI deploy| auto | auto after checks |

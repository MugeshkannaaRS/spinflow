-- Migration: Add company lifecycle fields
-- Run this for fresh Supabase deploys after alembic upgrade head

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Sync existing is_active rows to status field
UPDATE companies SET status = 'suspended' WHERE is_active = FALSE AND status = 'active';

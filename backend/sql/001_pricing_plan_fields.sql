-- Migration: Add pricing/plan fields to companies table
-- Run this in Supabase SQL editor

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'starter',
ADD COLUMN IF NOT EXISTS max_employees INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS licence_fee DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS maintenance_fee DECIMAL(12,2),
ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR DEFAULT 'annual',
ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT '[]';

-- Update existing companies with default plan
UPDATE companies SET
  plan = 'business',
  max_employees = 600,
  max_users = 50,
  licence_fee = 1500000,
  maintenance_fee = 300000
WHERE plan IS NULL;

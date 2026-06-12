-- Migration 010: Operator Groups
-- Assigns a named operator (emp_id + name) to a set of machine codes per mill.
-- machine_codes is a JSONB array of strings e.g. ["CD_001","CD_002","RF_001"]

CREATE TABLE IF NOT EXISTS operator_groups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mill_id     UUID REFERENCES mills(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    emp_id      VARCHAR(50),
    machine_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operator_groups_mill_id ON operator_groups(mill_id);
CREATE INDEX IF NOT EXISTS idx_operator_groups_active  ON operator_groups(mill_id, is_active);

-- Migration 011: Machine Groups
-- A named set of machines (e.g. "Carding Line 1", "Ring Frame Section A").
-- Groups are defined by the machine set, not by operator.
-- A machine can appear in multiple groups (machine_codes stored on the group, not the machine).
-- Note: mills.id is VARCHAR(36), not UUID — FK must match.

CREATE TABLE IF NOT EXISTS machine_groups (
    id            VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
    mill_id       VARCHAR(36)  REFERENCES mills(id) ON DELETE CASCADE,
    name          VARCHAR(200) NOT NULL,
    description   VARCHAR(500),
    machine_codes JSONB        NOT NULL DEFAULT '[]'::jsonb,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machine_groups_mill_id ON machine_groups(mill_id);
CREATE INDEX IF NOT EXISTS idx_machine_groups_active  ON machine_groups(mill_id, is_active);

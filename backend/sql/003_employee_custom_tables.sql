-- 003_employee_custom_tables.sql
--
-- Creates employee_custom_fields and employee_custom_values tables.
-- Required for custom field import to work end-to-end.
-- Run this directly in Supabase SQL editor if Alembic migrations
-- are not enabled for your deployment.

CREATE TABLE IF NOT EXISTS employee_custom_fields (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL REFERENCES companies(id),
    field_name VARCHAR(100) NOT NULL,
    field_type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_custom_fields_company
    ON employee_custom_fields(company_id);

CREATE TABLE IF NOT EXISTS employee_custom_values (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL REFERENCES employees(id),
    field_id VARCHAR(36) NOT NULL REFERENCES employee_custom_fields(id),
    value TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_custom_values_employee
    ON employee_custom_values(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_custom_values_field
    ON employee_custom_values(field_id);

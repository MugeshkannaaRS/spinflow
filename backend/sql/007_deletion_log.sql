-- Deletion log table for tracking company deletions
CREATE TABLE IF NOT EXISTS deletion_log (
    id VARCHAR(36) PRIMARY KEY,
    company_id VARCHAR(36) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    company_code VARCHAR(50) NOT NULL,
    deleted_by VARCHAR(36) NOT NULL,
    deleted_by_name VARCHAR(200),
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    affected_records JSONB,
    backup_location VARCHAR(500),
    backup_key VARCHAR(200),
    deletion_result VARCHAR(50) NOT NULL DEFAULT 'success',
    error_message TEXT,
    mode VARCHAR(20) NOT NULL DEFAULT 'hard'
);

CREATE INDEX IF NOT EXISTS idx_deletion_log_company_id ON deletion_log(company_id);
CREATE INDEX IF NOT EXISTS idx_deletion_log_deleted_at ON deletion_log(deleted_at);

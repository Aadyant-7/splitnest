CREATE TABLE import_jobs (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES expense_groups(id),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    file_name VARCHAR(255) NOT NULL,
    file_content BYTEA NOT NULL CHECK (octet_length(file_content) <= 5242880),
    total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
    imported_rows INTEGER NOT NULL DEFAULT 0 CHECK (imported_rows >= 0 AND imported_rows <= total_rows),
    invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0 AND invalid_rows <= total_rows),
    error_message VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX import_jobs_pending_idx ON import_jobs (created_at) WHERE status = 'PENDING';
CREATE INDEX import_jobs_processing_idx ON import_jobs (started_at) WHERE status = 'PROCESSING';
CREATE INDEX import_jobs_group_idx ON import_jobs (group_id, created_at DESC);
ALTER TABLE expenses ADD CONSTRAINT expenses_import_job_fk FOREIGN KEY (import_job_id) REFERENCES import_jobs(id);

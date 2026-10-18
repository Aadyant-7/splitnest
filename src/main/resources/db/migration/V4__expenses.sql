CREATE TABLE expenses (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES expense_groups(id),
    paid_by UUID NOT NULL REFERENCES users(id),
    amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description VARCHAR(500) NOT NULL CHECK (length(trim(description)) > 0),
    category VARCHAR(20) NOT NULL CHECK (category IN ('FOOD','GROCERIES','RENT','UTILITIES','TRAVEL','ENTERTAINMENT','SHOPPING','OTHER')),
    expense_date DATE NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    import_job_id UUID,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE expense_splits (
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    share_amount NUMERIC(12,2) NOT NULL CHECK (share_amount >= 0),
    PRIMARY KEY (expense_id,user_id)
);

CREATE INDEX idx_expenses_group_created ON expenses(group_id,created_at DESC,id DESC);
CREATE INDEX idx_expenses_group_payer ON expenses(group_id,paid_by);
CREATE INDEX idx_expense_splits_user ON expense_splits(user_id,expense_id);
CREATE INDEX idx_expenses_import_job ON expenses(import_job_id) WHERE import_job_id IS NOT NULL;

CREATE TABLE budgets (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES expense_groups(id),
    category VARCHAR(30) NOT NULL CHECK (category IN ('FOOD','GROCERIES','RENT','UTILITIES','TRAVEL','ENTERTAINMENT','SHOPPING','OTHER')),
    monthly_limit NUMERIC(12,2) NOT NULL CHECK (monthly_limit > 0),
    UNIQUE (group_id, category)
);
CREATE TABLE budget_alerts (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES expense_groups(id),
    category VARCHAR(30) NOT NULL CHECK (category IN ('FOOD','GROCERIES','RENT','UTILITIES','TRAVEL','ENTERTAINMENT','SHOPPING','OTHER')),
    month DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
    spent NUMERIC(12,2) NOT NULL CHECK (spent > 0),
    monthly_limit NUMERIC(12,2) NOT NULL CHECK (monthly_limit > 0),
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (group_id, category, month)
);
CREATE INDEX budget_alerts_group_month_idx ON budget_alerts(group_id, month DESC);

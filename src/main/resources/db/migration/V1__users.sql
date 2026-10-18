CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT users_normalized_email CHECK (email = lower(btrim(email))),
    CONSTRAINT users_display_name_not_blank CHECK (length(btrim(display_name)) > 0)
);

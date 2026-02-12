-- 004_billing.up.sql — Stripe Billing

-- Subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- active, past_due, canceling, canceled, incomplete
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions (stripe_subscription_id);

-- Pending Webhooks (for retry)
CREATE TABLE pending_webhooks (
    id TEXT PRIMARY KEY, -- Stripe event ID
    event_type TEXT NOT NULL,
    payload BYTEA NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, retry, processed, failed
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    last_attempt_at TIMESTAMPTZ,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_webhooks_status ON pending_webhooks (status) WHERE status IN ('pending', 'retry');

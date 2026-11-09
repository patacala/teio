-- =============================================================================
-- 042_billing_lifecycle.sql  –  Organization billing lifecycle (SaaS billing)
--
-- Extends the `billing` schema from 013. Platform subscription billing only;
-- payments organizations collect from their own customers live in `payments`.
--   * plans.currency: plan amounts are charged in the plan's currency.
--   * subscriptions.status accepts every Stripe subscription status (webhooks
--     with unpaid / incomplete_expired / paused previously violated the CHECK).
--   * subscriptions.past_due_since: start of the grace period.
--   * subscriptions.payment_method_*: snapshot of the default payment method
--     synced from Stripe webhooks (no card data beyond brand/last4/expiry).
--   * billing.stripe_events: processed webhook event ids (idempotency).
-- Idempotent.
-- =============================================================================

ALTER TABLE billing.plans
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'usd';

ALTER TABLE billing.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE billing.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'));

ALTER TABLE billing.subscriptions
  ADD COLUMN IF NOT EXISTS past_due_since            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method_id         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_method_type       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_method_brand      VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_method_last4      VARCHAR(4),
  ADD COLUMN IF NOT EXISTS payment_method_exp_month  INTEGER,
  ADD COLUMN IF NOT EXISTS payment_method_exp_year   INTEGER;

CREATE TABLE IF NOT EXISTS billing.stripe_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id  VARCHAR(255) NOT NULL UNIQUE,
  type             VARCHAR(100) NOT NULL,
  organization_id  UUID REFERENCES core.organizations(id) ON DELETE SET NULL,
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_org
  ON billing.stripe_events (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

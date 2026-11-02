-- =============================================================================
-- 013_billing.sql  –  Billing & SaaS infrastructure schema
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS billing;

-- ---------------------------------------------------------------------------
-- billing.plans  –  global plan catalog (seeded below)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.plans (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                      VARCHAR(100) NOT NULL UNIQUE,
  stripe_price_id_monthly   VARCHAR(255),
  stripe_price_id_yearly    VARCHAR(255),
  stripe_product_id         VARCHAR(255),
  price_monthly             INTEGER NOT NULL DEFAULT 0,   -- cents
  price_yearly              INTEGER NOT NULL DEFAULT 0,   -- cents
  limits                    JSONB NOT NULL DEFAULT '{}',  -- { conversations, messages, ai_calls, agents, voice_minutes }
  features                  JSONB NOT NULL DEFAULT '[]',  -- ["ai_responses","voice_calls","automation","analytics"]
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO billing.plans (name, price_monthly, price_yearly, limits, features, sort_order) VALUES
  ('free',         0,      0,
   '{"conversations":100,"messages":1000,"ai_calls":10,"agents":2,"voice_minutes":0}',
   '["basic_inbox","contacts"]',
   0),
  ('starter',      4900,   49000,
   '{"conversations":1000,"messages":10000,"ai_calls":100,"agents":5,"voice_minutes":60}',
   '["basic_inbox","contacts","ai_responses","analytics"]',
   1),
  ('professional', 14900,  149000,
   '{"conversations":10000,"messages":100000,"ai_calls":1000,"agents":20,"voice_minutes":600}',
   '["basic_inbox","contacts","ai_responses","analytics","voice_calls","automation"]',
   2),
  ('enterprise',   49900,  499000,
   '{"conversations":-1,"messages":-1,"ai_calls":-1,"agents":-1,"voice_minutes":-1}',
   '["all"]',
   3)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- billing.subscriptions  –  one per org
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.subscriptions (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL UNIQUE REFERENCES core.organizations(id) ON DELETE CASCADE,
  plan_id                UUID NOT NULL REFERENCES billing.plans(id),
  stripe_customer_id     VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  status                 VARCHAR(50) NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','trialing','past_due','canceled','incomplete')),
  billing_period         VARCHAR(20) NOT NULL DEFAULT 'monthly'
                           CHECK (billing_period IN ('monthly','yearly')),
  current_period_start   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end     TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  trial_end              TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT false,
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub
  ON billing.subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cust
  ON billing.subscriptions (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- billing.usage  –  per-org per-billing-period usage counters
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.usage (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  conversations   INTEGER NOT NULL DEFAULT 0,
  messages        INTEGER NOT NULL DEFAULT 0,
  ai_calls        INTEGER NOT NULL DEFAULT 0,
  voice_minutes   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_org_period
  ON billing.usage (organization_id, period_start DESC);

-- ---------------------------------------------------------------------------
-- billing.invoices  –  Stripe invoice history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS billing.invoices (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255) UNIQUE,
  amount_due        INTEGER NOT NULL DEFAULT 0,  -- cents
  amount_paid       INTEGER NOT NULL DEFAULT 0,
  currency          VARCHAR(10) NOT NULL DEFAULT 'usd',
  status            VARCHAR(50) NOT NULL
                      CHECK (status IN ('draft','open','paid','uncollectible','void')),
  invoice_url       TEXT,
  invoice_pdf       TEXT,
  period_start      TIMESTAMPTZ,
  period_end        TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_org
  ON billing.invoices (organization_id, created_at DESC);

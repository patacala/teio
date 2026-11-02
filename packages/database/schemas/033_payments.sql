-- =============================================================================
-- 033_payments.sql  –  Per-organization payment collection (Stripe)
--
-- Distinct from `billing` (which charges ORGANIZATIONS for their CRM
-- subscription using OUR Stripe account). This schema lets each organization
-- collect payments FROM THEIR OWN contacts using THEIR OWN Stripe account —
-- the AI agent sends a Checkout link for a configured service, and once paid
-- the CRM fires the existing agent-trigger pipeline (event `payment_received`)
-- so the agent picks the conversation back up on its own.
-- Idempotent.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS payments;

-- ---------------------------------------------------------------------------
-- payments.settings – one row per org: their own Stripe credentials.
-- stripe_secret_key / stripe_webhook_secret never leave the API once saved
-- (service layer returns a masked placeholder instead).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments.settings (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id        UUID NOT NULL UNIQUE REFERENCES core.organizations(id) ON DELETE CASCADE,
  stripe_secret_key      TEXT,
  stripe_webhook_secret  TEXT,
  currency               VARCHAR(10) NOT NULL DEFAULT 'usd',
  is_connected           BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- payments.services – the catalog an org configures ("Consulta inicial: $50").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments.services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  name              VARCHAR(255) NOT NULL,
  description       TEXT,
  amount            INTEGER NOT NULL CHECK (amount > 0), -- cents
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_services_org
  ON payments.services (organization_id, is_active);

-- ---------------------------------------------------------------------------
-- payments.payments – one row per payment link generated for a contact.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments.payments (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id             UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
  service_id                  UUID REFERENCES payments.services(id) ON DELETE SET NULL,
  contact_id                  UUID NOT NULL REFERENCES clients.contacts(id) ON DELETE CASCADE,
  conversation_id             UUID REFERENCES conversations.conversations(id) ON DELETE SET NULL,
  amount                      INTEGER NOT NULL, -- cents, snapshotted at creation time
  currency                    VARCHAR(10) NOT NULL,
  status                      VARCHAR(20) NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','paid','expired','canceled','failed')),
  stripe_checkout_session_id  VARCHAR(255) UNIQUE,
  stripe_payment_intent_id    VARCHAR(255),
  checkout_url                TEXT,
  metadata                    JSONB NOT NULL DEFAULT '{}',
  paid_at                     TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_org
  ON payments.payments (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_contact
  ON payments.payments (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_session
  ON payments.payments (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

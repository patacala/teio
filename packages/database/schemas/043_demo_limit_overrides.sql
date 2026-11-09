-- =============================================================================
-- 043_demo_limit_overrides.sql  –  Platform-managed demo limits
--
-- Demo organizations (free plan) use the free plan's limits as defaults.
-- Platform admins can override individual limits per organization; the
-- overrides only apply while the organization is a demo.
--   * subscriptions.demo_limit_overrides: partial { metric: limit } (-1 = unlimited)
--   * plans.updated_at: when the plan (and so the demo defaults) last changed
-- Idempotent.
-- =============================================================================

ALTER TABLE billing.subscriptions
  ADD COLUMN IF NOT EXISTS demo_limit_overrides   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS demo_limits_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_limits_updated_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

ALTER TABLE billing.plans
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

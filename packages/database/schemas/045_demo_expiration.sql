-- =============================================================================
-- 045_demo_expiration.sql  –  Demo accounts end after a set period
--
--   * plans.demo_duration_days: length of new demos (free plan). NULL = no end.
--   * subscriptions.demo_ends_at: when this organization's demo ends.
--     NULL = no end date ("free forever"), set by a platform admin.
--   * subscriptions.demo_period_updated_at/_by: who last changed it.
--
-- The defaults below run only once (when the columns are created), so
-- re-running this file never undoes later choices by a platform admin:
--   * the free plan gets a 7 day demo;
--   * every organization gets a billing row, and existing demos end 7 days
--     after this migration (not after their creation, which would end most
--     of them immediately).
-- Idempotent.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'billing' AND table_name = 'plans' AND column_name = 'demo_duration_days'
  ) THEN
    ALTER TABLE billing.plans
      ADD COLUMN demo_duration_days INTEGER CHECK (demo_duration_days IS NULL OR demo_duration_days > 0);
    UPDATE billing.plans SET demo_duration_days = 7 WHERE name = 'free';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'billing' AND table_name = 'subscriptions' AND column_name = 'demo_ends_at'
  ) THEN
    ALTER TABLE billing.subscriptions ADD COLUMN demo_ends_at TIMESTAMPTZ;

    INSERT INTO billing.subscriptions (organization_id, plan_id, status, billing_period)
    SELECT o.id, p.id, 'active', 'monthly'
    FROM core.organizations o
    CROSS JOIN billing.plans p
    WHERE p.name = 'free'
      AND NOT EXISTS (SELECT 1 FROM billing.subscriptions s WHERE s.organization_id = o.id);

    UPDATE billing.subscriptions s
    SET demo_ends_at = NOW() + make_interval(days => p.demo_duration_days)
    FROM billing.plans p
    WHERE p.id = s.plan_id
      AND p.price_monthly = 0 AND p.price_yearly = 0
      AND p.demo_duration_days IS NOT NULL;
  END IF;
END $$;

ALTER TABLE billing.subscriptions
  ADD COLUMN IF NOT EXISTS demo_period_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS demo_period_updated_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_demo_ends_at
  ON billing.subscriptions (demo_ends_at)
  WHERE demo_ends_at IS NOT NULL;

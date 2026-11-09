import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingLifecycle1793000000000 implements MigrationInterface {
  name = 'AddBillingLifecycle1793000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS billing.stripe_events;

      ALTER TABLE billing.subscriptions
        DROP COLUMN IF EXISTS payment_method_exp_year,
        DROP COLUMN IF EXISTS payment_method_exp_month,
        DROP COLUMN IF EXISTS payment_method_last4,
        DROP COLUMN IF EXISTS payment_method_brand,
        DROP COLUMN IF EXISTS payment_method_type,
        DROP COLUMN IF EXISTS payment_method_id,
        DROP COLUMN IF EXISTS past_due_since;

      ALTER TABLE billing.plans DROP COLUMN IF EXISTS currency;
    `);
  }
}

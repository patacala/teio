import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/045_demo_expiration.sql (defaults applied once). */
export class AddDemoExpiration1793300000000 implements MigrationInterface {
  name = 'AddDemoExpiration1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
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
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS billing.idx_subscriptions_demo_ends_at;
      ALTER TABLE billing.subscriptions
        DROP COLUMN IF EXISTS demo_period_updated_by,
        DROP COLUMN IF EXISTS demo_period_updated_at,
        DROP COLUMN IF EXISTS demo_ends_at;
      ALTER TABLE billing.plans DROP COLUMN IF EXISTS demo_duration_days;
    `);
  }
}

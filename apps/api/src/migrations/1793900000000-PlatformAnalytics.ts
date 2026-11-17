import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/056_platform_analytics.sql (backfill applied once). */
export class PlatformAnalytics1793900000000 implements MigrationInterface {
  name = 'PlatformAnalytics1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'core' AND table_name = 'organizations' AND column_name = 'is_internal'
        ) THEN
          ALTER TABLE core.organizations ADD COLUMN is_internal BOOLEAN NOT NULL DEFAULT false;

          UPDATE core.organizations o
          SET is_internal = true
          WHERE EXISTS (
            SELECT 1 FROM core.users u
            WHERE u.organization_id = o.id AND u.is_platform_admin = true
          );
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_organizations_internal
        ON core.organizations (id)
        WHERE is_internal = true;

      CREATE TABLE IF NOT EXISTS billing.mrr_snapshots (
        period_month     DATE NOT NULL,
        organization_id  UUID NOT NULL REFERENCES core.organizations(id) ON DELETE CASCADE,
        plan_id          UUID REFERENCES billing.plans(id) ON DELETE SET NULL,
        plan_name        VARCHAR(100) NOT NULL,
        billing_period   VARCHAR(20) NOT NULL,
        mrr              INTEGER NOT NULL CHECK (mrr >= 0),
        currency         VARCHAR(10) NOT NULL DEFAULT 'usd',
        captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (period_month, organization_id)
      );

      CREATE INDEX IF NOT EXISTS idx_mrr_snapshots_org
        ON billing.mrr_snapshots (organization_id, period_month DESC);

      CREATE INDEX IF NOT EXISTS idx_users_org_last_seen
        ON core.users (organization_id, last_seen_at DESC)
        WHERE last_seen_at IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_users_email_lower
        ON core.users (LOWER(email));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS core.idx_users_email_lower;
      DROP INDEX IF EXISTS core.idx_users_org_last_seen;
      DROP TABLE IF EXISTS billing.mrr_snapshots;
      DROP INDEX IF EXISTS core.idx_organizations_internal;
      ALTER TABLE core.organizations DROP COLUMN IF EXISTS is_internal;
    `);
  }
}

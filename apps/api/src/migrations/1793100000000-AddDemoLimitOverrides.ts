import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDemoLimitOverrides1793100000000 implements MigrationInterface {
  name = 'AddDemoLimitOverrides1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing.subscriptions
        ADD COLUMN IF NOT EXISTS demo_limit_overrides   JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS demo_limits_updated_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS demo_limits_updated_by UUID REFERENCES core.users(id) ON DELETE SET NULL;

      ALTER TABLE billing.plans
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE billing.plans DROP COLUMN IF EXISTS updated_at;
      ALTER TABLE billing.subscriptions
        DROP COLUMN IF EXISTS demo_limits_updated_by,
        DROP COLUMN IF EXISTS demo_limits_updated_at,
        DROP COLUMN IF EXISTS demo_limit_overrides;
    `);
  }
}

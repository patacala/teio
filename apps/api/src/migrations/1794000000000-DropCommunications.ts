import { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors packages/database/schemas/057_drop_communications.sql. */
export class DropCommunications1794000000000 implements MigrationInterface {
  name = 'DropCommunications1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS integrations.communication_deliveries;
      DROP TABLE IF EXISTS integrations.communication_templates;

      UPDATE core.organizations
      SET settings = settings - 'branding' - 'notification_preferences'
      WHERE settings ?| ARRAY['branding', 'notification_preferences'];
    `);
  }

  public async down(): Promise<void> {
    // Forward-only: the module and its data were removed on purpose.
  }
}

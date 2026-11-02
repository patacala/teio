import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniquePhoneContactIndex1792390598000 implements MigrationInterface {
  name = 'AddUniquePhoneContactIndex1792390598000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create unique partial index on normalized phone numbers.
    // Only applies to contacts with non-null, non-empty phone.
    // The expression matches the normalization in findByChannelIdentifier:
    // RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_phone_per_org
        ON clients.contacts (
          organization_id,
          RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', '', 'g'), 10)
        )
        WHERE phone IS NOT NULL AND phone <> '';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS clients.idx_contacts_unique_phone_per_org;
    `);
  }
}

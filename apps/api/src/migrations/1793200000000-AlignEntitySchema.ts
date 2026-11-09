import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignEntitySchema1793200000000 implements MigrationInterface {
  name = 'AlignEntitySchema1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE integrations.channels
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

      ALTER TABLE conversations.conversations
        ADD COLUMN IF NOT EXISTS is_pinned    BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
    `);
  }

  public async down(): Promise<void> {
    // Columns the entities require; dropping them would break the API.
  }
}

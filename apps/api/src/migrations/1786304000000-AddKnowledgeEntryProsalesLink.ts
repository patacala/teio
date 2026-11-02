import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKnowledgeEntryProsalesLink1786304000000 implements MigrationInterface {
  name = 'AddKnowledgeEntryProsalesLink1786304000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE knowledge.knowledge_entries
        ADD COLUMN IF NOT EXISTS prosales_document_id UUID;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE knowledge.knowledge_entries DROP COLUMN IF EXISTS prosales_document_id;
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutomationAgentAuthHeader1786303000000 implements MigrationInterface {
  name = 'AddAutomationAgentAuthHeader1786303000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_agents.agents
        ADD COLUMN IF NOT EXISTS auth_header_value TEXT;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ai_agents.agents DROP COLUMN IF EXISTS auth_header_value;
    `);
  }
}

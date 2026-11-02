import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAppointmentPaymentLinks1786302000000 implements MigrationInterface {
  name = 'AddAppointmentPaymentLinks1786302000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE scheduling.work_schedules
        ADD COLUMN IF NOT EXISTS payment_service_id UUID
          REFERENCES payments.services(id) ON DELETE SET NULL;

      ALTER TABLE payments.payments
        ADD COLUMN IF NOT EXISTS appointment_id UUID
          REFERENCES scheduling.appointments(id) ON DELETE SET NULL;

      CREATE INDEX IF NOT EXISTS idx_payments_appointment
        ON payments.payments (appointment_id)
        WHERE appointment_id IS NOT NULL;

      UPDATE scheduling.work_schedules
        SET payment_service_id = NULL
        WHERE type <> 'appointments' AND payment_service_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS payments.idx_payments_appointment;
      ALTER TABLE payments.payments DROP COLUMN IF EXISTS appointment_id;
      ALTER TABLE scheduling.work_schedules DROP COLUMN IF EXISTS payment_service_id;
    `);
  }
}

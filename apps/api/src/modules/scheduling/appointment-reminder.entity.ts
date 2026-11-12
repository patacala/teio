import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One reminder of a booking, due `offset_minutes` before its start. */
@Entity({ name: 'appointment_reminders', schema: 'scheduling' })
@Index(['appointment_id', 'offset_minutes'], { unique: true })
export class AppointmentReminderEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  appointment_id: string;

  @Column({ type: 'int' })
  offset_minutes: number;

  @Column({ type: 'timestamptz' })
  due_at: Date;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: 'pending' | 'sent' | 'cancelled';

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

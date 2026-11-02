import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'work_schedules', schema: 'scheduling' })
export class WorkScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  // Native PostgreSQL INTEGER[] — TypeORM returns a real JS number[]
  @Column({ type: 'int', array: true })
  work_days: number[];

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ type: 'int' })
  slot_duration_minutes: number;

  @Column({ type: 'int' })
  buffer_minutes: number;

  @Column({ type: 'varchar', length: 100 })
  timezone: string;

  // Native PostgreSQL DATE[] — TypeORM returns a real JS string[]
  @Column({ type: 'varchar', array: true })
  blocked_dates: string[];

  @Column({ type: 'varchar', length: 100, default: 'Appointments' })
  name: string;

  @Column({ type: 'varchar', length: 50, default: 'appointments' })
  type: string; // appointments | follow_up | custom

  /**
   * Service the agent charges for when it books into this calendar. Only
   * meaningful on `type = 'appointments'` — follow-up calendars stay free.
   */
  @Column({ type: 'uuid', nullable: true })
  payment_service_id: string | null;

  @Column({ type: 'varchar', length: 20, default: '#2563EB' })
  color: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

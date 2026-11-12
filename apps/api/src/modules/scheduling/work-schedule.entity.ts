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

  /** 'appointments' / 'follow_up' for the calendars the system creates; unique per organization. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  system_key: string | null;

  /** How long a slot stays reserved while the contact pays (30–1440). */
  @Column({ type: 'int', default: 60 })
  hold_minutes: number;

  /** Reminders to the contact, in minutes before the start (e.g. 1440 = a day before). */
  @Column({ type: 'int', array: true, default: () => "'{1440,120}'" })
  reminder_offsets_minutes: number[];

  /** The staff member this calendar belongs to; their bookings never overlap across calendars. */
  @Column({ type: 'uuid', nullable: true })
  owner_user_id: string | null;

  /** How soon a slot can be booked (minutes from now). */
  @Column({ type: 'int', default: 0 })
  min_notice_minutes: number;

  /** How far ahead a slot can be booked (days); null = no limit. */
  @Column({ type: 'int', nullable: true })
  max_advance_days: number | null;

  /** Days of free times a contact sees when changing a booking from their link. */
  @Column({ type: 'int', default: 14 })
  contact_reschedule_days: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

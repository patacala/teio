import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ContactEntity } from '../client-management/contact.entity';

export type ScheduledActionStatus = 'pending' | 'processing' | 'awaiting_user' | 'completed' | 'cancelled' | 'failed';

/**
 * One automation step ("send a WhatsApp at 10:00", "call the contact"):
 * executed by the automation engine when due, or handed to a person when
 * `executor = 'user'`. Not a booking — bookings live in scheduling.appointments.
 */
@Entity({ name: 'scheduled_actions', schema: 'scheduling' })
@Index(['organization_id', 'due_at'])
export class ScheduledActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  /** The follow-up calendar it is shown on. */
  @Column({ type: 'uuid', nullable: true })
  calendar_id: string | null;

  @Column({ type: 'uuid' })
  contact_id: string;

  @ManyToOne(() => ContactEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact: ContactEntity;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  sequence_id: string | null;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 20 })
  action: string;

  @Column({ length: 10, default: 'system' })
  executor: string;

  @Column({ length: 20, default: 'auto' })
  channel_strategy: string;

  @Column({ type: 'text', nullable: true })
  message_content: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ScheduledActionStatus;

  @Column({ type: 'timestamptz' })
  due_at: Date;

  @Column({ length: 100, default: 'UTC' })
  timezone: string;

  @Column({ length: 50, default: 'manual' })
  source: string;

  @Column({ length: 20, default: 'automation' })
  origin: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 3 })
  max_attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  resolved_channel: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  completed_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

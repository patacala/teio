import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ContactEntity } from '../client-management/contact.entity';

@Entity({ name: 'appointments', schema: 'scheduling' })
@Index(['organization_id', 'starts_at'])
@Index(['organization_id', 'status'])
export class AppointmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  calendar_id: string;

  @Column({ type: 'uuid' })
  contact_id: string;

  @ManyToOne(() => ContactEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contact_id' })
  contact: ContactEntity;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_to: string;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, default: 'scheduled' })
  status: string;

  @Column({ type: 'timestamptz' })
  starts_at: Date;

  @Column({ type: 'timestamptz' })
  ends_at: Date;

  @Column({ length: 100, default: 'UTC' })
  timezone: string;

  @Column({ nullable: true })
  location: string;

  @Column({ nullable: true })
  meeting_url: string;

  @Column({ default: false })
  reminder_sent: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ length: 20, default: 'human' })
  origin: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  // ── Automation fields ──────────────────────────────────────────────────
  @Column({ length: 20, nullable: true })
  action: string;

  @Column({ length: 10, nullable: true, default: 'system' })
  executor: string;

  @Column({ length: 20, nullable: true, default: 'auto' })
  channel_strategy: string;

  @Column({ type: 'text', nullable: true })
  message_content: string;

  @Column({ length: 50, nullable: true, default: 'manual' })
  source: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', default: 3 })
  max_attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string;

  @Column({ length: 50, nullable: true })
  resolved_channel: string;

  @Column({ type: 'uuid', nullable: true })
  sequence_id: string;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

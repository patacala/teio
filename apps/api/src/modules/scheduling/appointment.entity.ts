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

  @ManyToOne(() => ContactEntity, { onDelete: 'CASCADE' })
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

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ length: 20, default: 'human' })
  origin: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date;

  // ── Booking lifecycle ──────────────────────────────────────────────────
  @Column({ type: 'timestamptz', nullable: true })
  confirmed_at: Date | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  confirmed_via: string | null;

  @Column({ type: 'uuid', nullable: true })
  confirmed_by: string | null;

  /** Bumped on every reschedule so confirmation links for the old time stop working. */
  @Column({ type: 'int', default: 1 })
  confirmation_version: number;

  @Column({ type: 'timestamptz', nullable: true })
  cancelled_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelled_by: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cancel_reason: string | null;

  /** Set when an admin booked outside the calendar rules; such rows are exempt from the overlap constraint. */
  @Column({ type: 'timestamptz', nullable: true })
  override_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  override_by: string | null;

  @Column({ type: 'text', nullable: true })
  override_reason: string | null;

  /** Only for status = 'held': the slot is released after this instant. */
  @Column({ type: 'timestamptz', nullable: true })
  hold_expires_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  payment_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  payment_waived_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

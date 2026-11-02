import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

@Entity({ name: 'automation_sequences', schema: 'scheduling' })
@Index(['organization_id', 'status'])
export class AutomationSequenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  contact_id: string;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string;

  @Column({ length: 30, default: 'no_response' })
  sequence_type: string;

  @Column({ type: 'int', default: 1 })
  current_attempt: number;

  @Column({ type: 'int', default: 7 })
  max_attempts: number;

  @Column({ length: 20, default: 'active' })
  status: string;

  @Column({ length: 30, nullable: true })
  completion_reason: string;

  @Column({ length: 50, default: 'manual' })
  source: string;

  /** Channel the contact last wrote on — promoted out of metadata so it is queryable. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  channel: string | null;

  /** Template the steps were cloned from. Analytics only — the clone is independent. */
  @Column({ type: 'uuid', nullable: true })
  template_id: string | null;

  @Column({ type: 'timestamptz' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

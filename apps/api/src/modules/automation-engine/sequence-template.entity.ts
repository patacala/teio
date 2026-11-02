import {
  Entity, PrimaryGeneratedColumn, Column, OneToMany,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';
import type { SequenceTemplateStepEntity } from './sequence-template-step.entity';

/**
 * Reusable follow-up cadence, keyed by `sequence_type` rather than by channel —
 * the channel is resolved per step at execution time.
 *
 * `organization_id` NULL means a platform default; a row with it set is an
 * org's own customisation, which takes precedence.
 */
@Entity({ name: 'sequence_templates', schema: 'scheduling' })
@Index(['organization_id', 'sequence_type'])
export class SequenceTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  organization_id: string | null;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 30, default: 'no_response' })
  sequence_type: string;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany('SequenceTemplateStepEntity', 'template', { eager: true, cascade: true })
  steps: SequenceTemplateStepEntity[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

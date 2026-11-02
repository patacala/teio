import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import type { FunnelTemplateEntity } from './funnel-template.entity';

@Entity({ name: 'funnel_template_stages', schema: 'clients' })
export class FunnelTemplateStageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  template_id: string;

  @ManyToOne('FunnelTemplateEntity', 'stages', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: FunnelTemplateEntity;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'integer', default: 0 })
  position: number;

  @Column({ length: 20, nullable: true })
  color: string;

  /** Portable semantics copied into funnel_stages on applyTemplate. */
  @Column({ length: 30, default: 'custom' })
  stage_type: string;

  @Column({ type: 'boolean', default: false })
  is_terminal: boolean;

  @Column({ type: 'integer', nullable: true })
  rotting_days: number | null;
}

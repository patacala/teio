import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn,
} from 'typeorm';
import type { SequenceTemplateEntity } from './sequence-template.entity';

@Entity({ name: 'sequence_template_steps', schema: 'scheduling' })
export class SequenceTemplateStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  template_id: string;

  @ManyToOne('SequenceTemplateEntity', 'steps', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'template_id' })
  template: SequenceTemplateEntity;

  /** 1-based, matches AutomationSequenceEntity.current_attempt */
  @Column({ type: 'integer' })
  position: number;

  /** ActionType — 'send_message' | 'call' | 'send_email' | … */
  @Column({ length: 20, default: 'send_message' })
  action: string;

  /** Resolved at execution time by ChannelStrategyResolverService */
  @Column({ length: 20, default: 'auto' })
  channel_strategy: string;

  @Column({ type: 'integer', default: 24 })
  delay_hours: number;

  /** Per-step options (message_template, call_prompt, …) without schema churn */
  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * The cloned plan for ONE sequence. Copied from a template on creation so that
 * editing the template never affects sequences already in flight.
 *
 * Execution state (status, attempts, last_error) deliberately lives in
 * `scheduling.appointments`, which already tracks it and links back via
 * `sequence_id` — duplicating it here would guarantee drift. Only the observed
 * outcome of a step is recorded below.
 */
@Entity({ name: 'sequence_steps', schema: 'scheduling' })
@Index(['sequence_id', 'position'], { unique: true })
@Index(['organization_id'])
export class SequenceStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  sequence_id: string;

  /** 1-based, matches AutomationSequenceEntity.current_attempt */
  @Column({ type: 'integer' })
  position: number;

  @Column({ length: 20, default: 'send_message' })
  action: string;

  @Column({ length: 20, default: 'auto' })
  channel_strategy: string;

  @Column({ type: 'integer', default: 24 })
  delay_hours: number;

  @Column({ type: 'jsonb', default: {} })
  config: Record<string, unknown>;

  /** What actually ran — e.g. 'call' degraded to 'send_message' with no webhook */
  @Column({ type: 'varchar', length: 20, nullable: true })
  executed_action: string | null;

  /** Channel the resolver actually picked, for auditing strategy effectiveness */
  @Column({ type: 'varchar', length: 20, nullable: true })
  resolved_channel: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

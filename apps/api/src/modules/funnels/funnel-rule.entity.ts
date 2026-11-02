import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

/**
 * A data-driven funnel automation rule. `organization_id`/`funnel_id` NULL means
 * a system default that applies to every org/funnel; a non-null value scopes the
 * rule. Rules target a portable `to_stage_type`, resolved to the real stage in
 * the contact's own funnel at evaluation time.
 */
@Entity({ name: 'funnel_rules', schema: 'clients' })
@Index(['trigger_event', 'is_active'])
export class FunnelRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  organization_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  funnel_id: string | null;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 60 })
  trigger_event: string;

  @Column({ type: 'jsonb', default: {} })
  conditions: Record<string, unknown>;

  /** Empty = matches any source stage. */
  @Column({ type: 'text', array: true, default: '{}' })
  from_stage_types: string[];

  @Column({ length: 30 })
  to_stage_type: string;

  /** 'forward_only' (never moves backward) or 'any'. */
  @Column({ length: 20, default: 'forward_only' })
  direction_policy: string;

  @Column({ type: 'integer', default: 0 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

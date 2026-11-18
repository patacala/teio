import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ConditionGroup, NodeHandle, RunScope, RunStatus, TriggerKey } from '@crm/shared';

/** What a waiting run waits for: an event (with a timeout) or a task someone has to finish. */
export interface RunWaitingFor {
  node_key: string;
  events: TriggerKey[];
  filters?: ConditionGroup;
  /** ISO time; null = no timeout (a task without a due limit). */
  timeout_at: string | null;
  on_match: NodeHandle;
  on_timeout: NodeHandle | null;
  /** A "Create task" step waiting until the task is done. */
  task_id?: string;
}

/** What the run knows: the trigger event and values steps computed. */
export interface RunContext {
  /** The event that started the run: its `trigger.*` fields and its original payload. */
  trigger: { key: string; event_id?: string | null; data: Record<string, unknown>; raw?: Record<string, unknown> };
  /** The event that resumed a "wait for event" step, if any. */
  last_event?: { key: string; data: Record<string, unknown> } | null;
  /**
   * When a parked run continues: leave `node_key` (already done) through
   * `handle`. Absent = run `current_node_key` (again) — a retry or a deferral.
   */
  resume?: { node_key: string; handle: NodeHandle } | null;
  /** The step being executed, kept across retries so deliveries are not repeated. */
  current_step?: { no: number; id: string; node_key: string } | null;
  /** What that step saved so far (a bulk send's progress, a task it created…). */
  current_step_output?: Record<string, unknown> | null;
  /** Steps executed so far (numbers the next one). */
  steps_count?: number;
  [key: string]: unknown;
}

/** One execution of one published version, for a contact or for the organization. */
@Entity({ name: 'automation_runs', schema: 'automation' })
export class AutomationRunEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  automation_id: string;

  @Column({ type: 'uuid' })
  version_id: string;

  @Column({ type: 'varchar', length: 20, default: 'contact' })
  scope: RunScope;

  @Column({ type: 'uuid', nullable: true })
  contact_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  /** Counts towards "one active run per contact" (false = the automation allows parallel runs). */
  @Column({ default: true })
  exclusive: boolean;

  @Column({ type: 'varchar', length: 20, default: 'waiting' })
  status: RunStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  current_node_key: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resume_at: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  waiting_for: RunWaitingFor | null;

  @Column({ type: 'jsonb', default: {} })
  context: RunContext;

  @Column({ type: 'integer', default: 0 })
  seq: number;

  @Column({ type: 'timestamptz', nullable: true })
  locked_until: Date | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ length: 60 })
  trigger_key: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  trigger_event_id: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  exit_reason: string | null;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

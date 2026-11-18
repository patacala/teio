import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { NodeType, RunStepStatus } from '@crm/shared';

/** What one step of a run did — the history shown in the app. */
@Entity({ name: 'automation_run_steps', schema: 'automation' })
export class AutomationRunStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  run_id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'integer' })
  step_no: number;

  @Column({ length: 64 })
  node_key: string;

  @Column({ type: 'varchar', length: 40 })
  node_type: NodeType;

  @Column({ type: 'varchar', length: 20, default: 'running' })
  status: RunStepStatus;

  @Column({ type: 'varchar', length: 40, nullable: true })
  branch: string | null;

  @Column({ type: 'jsonb', default: {} })
  output: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finished_at: Date | null;
}

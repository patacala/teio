import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AutomationGraph, AutomationSettings, AutomationTrigger } from '@crm/shared';

/** An immutable published version. Runs pin to it. */
@Entity({ name: 'automation_versions', schema: 'automation' })
export class AutomationVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  automation_id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'jsonb', default: [] })
  triggers: AutomationTrigger[];

  @Column({ type: 'jsonb' })
  graph: AutomationGraph;

  @Column({ type: 'jsonb', default: {} })
  settings: AutomationSettings;

  @Column({ type: 'uuid', nullable: true })
  published_by: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  published_at: Date;
}

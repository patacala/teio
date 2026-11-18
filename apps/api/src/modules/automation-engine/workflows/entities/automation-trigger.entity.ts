import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ConditionGroup } from '@crm/shared';

/** Which active automation an event starts — rebuilt from the published version. */
@Entity({ name: 'automation_triggers', schema: 'automation' })
export class AutomationTriggerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  automation_id: string;

  @Column({ type: 'uuid' })
  version_id: string;

  @Column({ length: 60 })
  trigger_key: string;

  @Column({ type: 'jsonb', default: {} })
  filters: ConditionGroup;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

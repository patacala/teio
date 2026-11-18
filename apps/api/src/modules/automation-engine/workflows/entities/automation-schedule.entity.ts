import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { ScheduleSpec } from '@crm/shared';

/** When a scheduled automation runs next — rebuilt from the published version. */
@Entity({ name: 'automation_schedules', schema: 'automation' })
export class AutomationScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  automation_id: string;

  @Column({ type: 'uuid' })
  version_id: string;

  @Column({ type: 'jsonb' })
  spec: ScheduleSpec;

  @Column({ length: 100, default: 'UTC' })
  timezone: string;

  @Column({ type: 'timestamptz', nullable: true })
  next_run_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_run_at: Date | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

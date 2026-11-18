import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import type { AutomationCategory, AutomationDefinition, AutomationStatus } from '@crm/shared';

/**
 * An organization's automation: the draft edited in the builder plus a
 * pointer to the version that runs. System automations (`template_key` set)
 * are installed by the platform and cannot be deleted.
 */
@Entity({ name: 'automations', schema: 'automation' })
@Index(['organization_id', 'status'])
export class AutomationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status: AutomationStatus;

  @Column({ type: 'varchar', length: 20, default: 'custom' })
  category: AutomationCategory;

  @Column({ type: 'varchar', length: 60, nullable: true })
  template_key: string | null;

  @Column({ default: false })
  is_system: boolean;

  @Column({ length: 10, default: 'en' })
  locale: string;

  @Column({ type: 'jsonb', default: {} })
  draft: AutomationDefinition;

  @Column({ type: 'uuid', nullable: true })
  published_version_id: string | null;

  @Column({ default: false })
  has_unpublished_changes: boolean;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @Column({ type: 'uuid', nullable: true })
  updated_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

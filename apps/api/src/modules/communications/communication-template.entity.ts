import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'communication_templates', schema: 'integrations' })
@Index(['organization_id'])
@Index(['organization_id', 'event_type', 'channel_type', 'is_active'])
export class CommunicationTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  organization_id: string | null;

  @ManyToOne(() => OrganizationEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity | null;

  @Column({ length: 100 })
  event_type: string;

  @Column({ length: 50 })
  channel_type: string;

  @Column({ length: 100 })
  provider: string;

  @Column({ length: 500 })
  provider_template_id: string;

  @Column({ type: 'uuid', nullable: true })
  channel_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', default: {} })
  variables_schema: Record<string, unknown>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  from_override: string | null;

  @Column({ type: 'boolean', default: false })
  is_system: boolean;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

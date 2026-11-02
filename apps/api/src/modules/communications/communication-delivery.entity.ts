import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { CommunicationTemplateEntity } from './communication-template.entity';

@Entity({ name: 'communication_deliveries', schema: 'integrations' })
@Index(['organization_id'])
@Index(['organization_id', 'status'])
@Index(['created_at'])
export class CommunicationDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  communication_template_id: string | null;

  @ManyToOne(() => CommunicationTemplateEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'communication_template_id' })
  communication_template: CommunicationTemplateEntity | null;

  @Column({ length: 100 })
  event_type: string;

  @Column({ length: 50 })
  channel_type: string;

  @Column({ length: 100 })
  provider: string;

  @Column({ length: 500 })
  recipient: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  provider_template_id: string | null;

  @Column({ type: 'jsonb', default: {} })
  variables: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  provider_message_id: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  delivered_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

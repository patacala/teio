import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity({ name: 'agents', schema: 'ai_agents' })
@Index(['organization_id', 'trigger_event'])
export class AutomationAgentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 100 })
  trigger_event: string;

  @Column({ type: 'text' })
  workflow_endpoint: string;

  // Sent as `X-API-Key` on the webhook POST when set. n8n workflows validate
  // via a secret embedded in their own URL and leave this null; ProSales'
  // inbound endpoint requires it (its org-scoped API key).
  @Column({ type: 'text', nullable: true })
  auth_header_value: string | null;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'conversations', schema: 'conversations' })
@Index(['organization_id', 'status'])
@Index(['organization_id', 'channel'])
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  contact_id: string;

  @Column({ length: 50 })
  channel: string;

  @Column({ length: 50, default: 'open' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  assigned_agent_id: string;

  @Column({ type: 'uuid', nullable: true })
  ai_agent_id: string;

  @Column({ length: 500, nullable: true })
  subject: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_message_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @Column({ type: 'boolean', default: true })
  bot_active: boolean;

  @Column({ type: 'boolean', default: false })
  is_pinned: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  last_read_at: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

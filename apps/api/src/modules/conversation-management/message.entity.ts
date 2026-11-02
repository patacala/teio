import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { ConversationEntity } from './conversation.entity';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'messages', schema: 'conversations' })
@Index(['conversation_id', 'sent_at'])
@Index(['organization_id', 'channel', 'sent_at'])
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  conversation_id: string;

  @ManyToOne(() => ConversationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ConversationEntity;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ length: 50, default: 'text' })
  type: string;

  @Column({ length: 20 })
  direction: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ type: 'uuid', nullable: true })
  sender_id: string;

  @Column({ length: 50, default: 'system' })
  channel: string;

  @Column({ length: 500, nullable: true })
  channel_message_id: string;

  @Column({ length: 20, default: 'user' })
  sender_type: string;

  @Column({ nullable: true })
  media_url: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  sent_at: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

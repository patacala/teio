import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'message_templates', schema: 'conversations' })
@Index(['organization_id', 'channel'])
export class MessageTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 50, default: 'all' })
  channel: string;

  @Column({ type: 'text', array: true, default: '{}' })
  variables: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

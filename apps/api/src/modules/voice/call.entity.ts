import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { ContactEntity } from '../client-management/contact.entity';

@Entity({ name: 'calls', schema: 'voice' })
@Index(['organization_id', 'created_at'])
@Index(['external_call_id'], { unique: true })
export class CallEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  contact_id: string | null;

  @ManyToOne(() => ContactEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact: ContactEntity | null;

  @Column({ type: 'uuid', nullable: true })
  conversation_id: string | null;

  /** 'inbound' = the contact called us; 'outbound' = we called the contact. */
  @Column({ length: 20, default: 'inbound' })
  direction: string;

  @Column({ length: 50, default: 'voice' })
  channel: string;

  @Column({ length: 50, default: 'retell' })
  provider: string;

  @Column({ length: 255 })
  external_call_id: string;

  @Column({ length: 50 })
  phone_from: string;

  @Column({ length: 50 })
  phone_to: string;

  @Column({ length: 20, default: 'initiated' })
  status: string;

  @Column({ type: 'integer', nullable: true })
  duration_seconds: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  ended_at: Date | null;

  @Column({ type: 'text', nullable: true })
  recording_url: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

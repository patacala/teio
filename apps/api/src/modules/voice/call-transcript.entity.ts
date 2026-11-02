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
import { CallEntity } from './call.entity';

@Entity({ name: 'call_transcripts', schema: 'voice' })
@Index(['call_id', 'timestamp_seconds'])
export class CallTranscriptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  call_id: string;

  @ManyToOne(() => CallEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'call_id' })
  call: CallEntity;

  @Column({ length: 20 })
  speaker: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  timestamp_seconds: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

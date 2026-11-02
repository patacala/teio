import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity({ name: 'usage', schema: 'billing' })
@Unique(['organization_id', 'period_start'])
@Index(['organization_id', 'period_start'])
export class UsageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'timestamptz' })
  period_start: Date;

  @Column({ type: 'timestamptz' })
  period_end: Date;

  @Column({ type: 'int', default: 0 })
  conversations: number;

  @Column({ type: 'int', default: 0 })
  messages: number;

  @Column({ type: 'int', default: 0 })
  ai_calls: number;

  @Column({ type: 'int', default: 0 })
  voice_minutes: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

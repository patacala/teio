import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'events', schema: 'analytics' })
@Index(['organization_id', 'occurred_at'])
@Index(['organization_id', 'event_type'])
export class AnalyticsEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ length: 100 })
  event_type: string;

  @Column({ type: 'uuid', nullable: true })
  actor_id: string;

  @Column({ length: 50, nullable: true })
  actor_type: string;

  @Column({ type: 'uuid', nullable: true })
  resource_id: string;

  @Column({ length: 50, nullable: true })
  resource_type: string;

  @Column({ type: 'jsonb', default: {} })
  properties: Record<string, unknown>;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurred_at: Date;
}

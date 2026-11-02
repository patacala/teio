import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';
import { FunnelEntity } from './funnel.entity';

@Entity({ name: 'funnel_stages', schema: 'clients' })
@Index(['funnel_id', 'position'])
export class FunnelStageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  funnel_id: string | null;

  @ManyToOne(() => FunnelEntity, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'funnel_id' })
  funnel: FunnelEntity;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'integer', default: 0, name: 'position' })
  position: number;

  @Column({ length: 20, nullable: true })
  color: string;

  /** Portable semantics for automation rules — see 037_funnel_semantics.sql. */
  @Column({ length: 30, default: 'custom' })
  stage_type: string;

  /** Won/lost stages: automation never moves a contact out of these. */
  @Column({ type: 'boolean', default: false })
  is_terminal: boolean;

  /** Days in-stage before the contact is considered rotting (null = never). */
  @Column({ type: 'integer', nullable: true })
  rotting_days: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

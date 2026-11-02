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
import { OrganizationEntity } from '../organizations/organization.entity';
import { CompanyEntity } from './company.entity';

@Entity({ name: 'contacts', schema: 'clients' })
@Index(['organization_id'])
export class ContactEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  company_id: string;

  @ManyToOne(() => CompanyEntity, { nullable: true, eager: false })
  @JoinColumn({ name: 'company_id' })
  company: CompanyEntity;

  @Column({ length: 100 })
  first_name: string;

  @Column({ length: 100, nullable: true })
  last_name: string;

  @Column({ length: 320, nullable: true })
  email: string;

  @Column({ length: 50, nullable: true })
  phone: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column({ length: 50, default: 'active' })
  status: string;

  @Column({ type: 'jsonb', default: {} })
  channel_ids: Record<string, string>;

  @Column({ type: 'jsonb', default: {} })
  custom_fields: Record<string, unknown>;

  @Column({ type: 'text', array: true, default: '{}' })
  tags: string[];

  @Column({ type: 'uuid', nullable: true })
  assigned_to: string;

  @Column({ type: 'timestamptz', nullable: true })
  last_contacted_at: Date;

  @Column({ length: 500, nullable: true })
  external_id: string;

  @Column({ length: 100, nullable: true })
  lead_stage: string;

  @Column({ type: 'integer', default: 0 })
  lead_score: number;

  @Column({ length: 10, default: 'ai' })
  handled_by: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  /**
   * Snapshot of the AI's read on this contact (intent/sentiment/summary),
   * shallow-merged on every update (see ClientManagementService.update) so a
   * partial signal doesn't wipe out the rest — a contact's mood can change
   * from one message to the next.
   */
  @Column({ type: 'jsonb', default: {} })
  ai_insights: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

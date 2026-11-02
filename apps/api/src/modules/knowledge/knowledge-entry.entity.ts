import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { OrganizationEntity } from '../organizations/organization.entity';

@Entity({ name: 'knowledge_entries', schema: 'knowledge' })
@Index(['organization_id'])
@Index(['organization_id', 'status'])
export class KnowledgeEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ length: 100, default: 'general' })
  category: string;

  @Column({ length: 20, default: 'active' })
  status: string;

  // ProSales' KnowledgeDocumentModel.id, when this entry has been synced —
  // ProSales' knowledge endpoints are create/delete only (no update), so
  // KnowledgeService re-creates in ProSales on every content change and
  // updates this pointer. Null while unsynced or while status='inactive'
  // (inactive entries are removed from ProSales, not just hidden).
  @Column({ type: 'uuid', nullable: true })
  prosales_document_id: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

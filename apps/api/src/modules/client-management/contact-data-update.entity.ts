import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'contact_data_updates', schema: 'clients' })
@Index(['contact_id', 'created_at'])
export class ContactDataUpdateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  contact_id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'jsonb', default: {} })
  changed_fields: Record<string, { from: unknown; to: unknown }>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  changed_by: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

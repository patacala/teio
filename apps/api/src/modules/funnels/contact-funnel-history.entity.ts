import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'contact_funnel_history', schema: 'clients' })
export class ContactFunnelHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  contact_id: string;

  @Column({ type: 'uuid', nullable: true })
  from_stage_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  to_stage_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  changed_by: string | null;

  /** 'manual' (a user moved it) or 'automation' (a funnel rule). Drives the anti-override guard. */
  @Column({ length: 20, default: 'manual' })
  source: string;

  /** Human-readable why, e.g. the rule name that moved the contact. */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity({ name: 'stripe_events', schema: 'billing' })
@Index(['organization_id', 'created_at'], { where: 'organization_id IS NOT NULL' })
export class StripeEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  stripe_event_id: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'uuid', nullable: true })
  organization_id: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processed_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

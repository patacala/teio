import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type DeliveryStatus = 'sending' | 'sent' | 'failed' | 'skipped';

/**
 * One recipient of one step. Claimed (inserted) before sending: a retried or
 * resumed step skips recipients it already claimed, so nobody gets the same
 * message twice from one step.
 */
@Entity({ name: 'automation_deliveries', schema: 'automation' })
export class AutomationDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'uuid' })
  run_step_id: string;

  @Column({ length: 320 })
  recipient_key: string;

  @Column({ length: 20 })
  channel: string;

  @Column({ type: 'varchar', length: 20, default: 'sending' })
  status: DeliveryStatus;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference_id: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

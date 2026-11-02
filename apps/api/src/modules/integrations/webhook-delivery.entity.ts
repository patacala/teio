import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index,
} from 'typeorm';

@Entity({ name: 'webhook_deliveries', schema: 'integrations' })
@Index(['webhook_id'])
@Index(['delivered_at'])
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  webhook_id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ length: 100 })
  event_type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'int', nullable: true })
  status_code: number | null;

  @Column({ type: 'text', nullable: true })
  response_body: string | null;

  @Column({ type: 'int', nullable: true })
  duration_ms: number | null;

  @Column({ type: 'boolean', nullable: true })
  succeeded: boolean | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  delivered_at: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/** An event waiting to be (or already) published to RabbitMQ. */
@Entity({ name: 'outbox_events', schema: 'core' })
export class OutboxEventEntity {
  @PrimaryColumn('uuid')
  id: string;

  /** Publication order (events of one transaction share created_at). */
  @Column({ type: 'bigint', insert: false, update: false })
  seq: string;

  @Column({ type: 'uuid', nullable: true })
  organization_id: string | null;

  @Column({ length: 100 })
  topic: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'text', nullable: true })
  last_error: string | null;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  available_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  published_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

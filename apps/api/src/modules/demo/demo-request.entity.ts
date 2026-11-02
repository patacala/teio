import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { DemoType, DemoRequestStatus } from '@crm/shared';

@Entity({ schema: 'clients', name: 'demo_requests' })
export class DemoRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  contact_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  company_id: string | null;

  @Index()
  @Column({ type: 'uuid' })
  organization_id: string;

  @Column({ type: 'varchar', length: 50 })
  demo_type: DemoType;

  @Column({ type: 'varchar', length: 50, default: DemoRequestStatus.PROCESSING })
  status: DemoRequestStatus;

  @Column({ type: 'uuid', nullable: true })
  init_token_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  experience_token_id: string | null;

  @Column({ type: 'text', nullable: true })
  demo_url: string | null;

  @Column({ type: 'text', nullable: true })
  error_message: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

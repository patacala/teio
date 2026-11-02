import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity({ name: 'invoices', schema: 'billing' })
@Index(['organization_id', 'created_at'])
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  stripe_invoice_id: string | null;

  @Column({ type: 'int', default: 0 })
  amount_due: number;

  @Column({ type: 'int', default: 0 })
  amount_paid: number;

  @Column({ length: 10, default: 'usd' })
  currency: string;

  @Column({ length: 50 })
  status: string;

  @Column({ type: 'text', nullable: true })
  invoice_url: string | null;

  @Column({ type: 'text', nullable: true })
  invoice_pdf: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  period_start: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  period_end: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  paid_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

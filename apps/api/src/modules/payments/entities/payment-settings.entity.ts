import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

@Entity({ name: 'settings', schema: 'payments' })
export class PaymentSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'text', nullable: true })
  stripe_secret_key: string | null;

  @Column({ type: 'text', nullable: true })
  stripe_webhook_secret: string | null;

  @Column({ length: 10, default: 'usd' })
  currency: string;

  @Column({ default: false })
  is_connected: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';
import { PlanEntity } from './plan.entity';

@Entity({ name: 'subscriptions', schema: 'billing' })
@Index(['stripe_subscription_id'], { where: 'stripe_subscription_id IS NOT NULL' })
@Index(['stripe_customer_id'], { where: 'stripe_customer_id IS NOT NULL' })
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid' })
  plan_id: string;

  @ManyToOne(() => PlanEntity, { eager: true })
  @JoinColumn({ name: 'plan_id' })
  plan: PlanEntity;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_customer_id: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_subscription_id: string | null;

  @Column({ length: 50, default: 'active' })
  status: string;

  @Column({ length: 20, default: 'monthly' })
  billing_period: string;

  @Column({ type: 'timestamptz' })
  current_period_start: Date;

  @Column({ type: 'timestamptz' })
  current_period_end: Date;

  @Column({ type: 'timestamptz', nullable: true })
  trial_end: Date | null;

  @Column({ default: false })
  cancel_at_period_end: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

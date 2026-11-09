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
import type { BillingPeriod, PlanLimits, SubscriptionStatus } from '@crm/shared';

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

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: SubscriptionStatus;

  @Column({ type: 'varchar', length: 20, default: 'monthly' })
  billing_period: BillingPeriod;

  @Column({ type: 'timestamptz' })
  current_period_start: Date;

  @Column({ type: 'timestamptz' })
  current_period_end: Date;

  @Column({ type: 'timestamptz', nullable: true })
  trial_end: Date | null;

  @Column({ default: false })
  cancel_at_period_end: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  past_due_since: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  payment_method_id: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method_type: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  payment_method_brand: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  payment_method_last4: string | null;

  @Column({ type: 'int', nullable: true })
  payment_method_exp_month: number | null;

  @Column({ type: 'int', nullable: true })
  payment_method_exp_year: number | null;

  /** Per-organization demo limits set by a platform admin; only applied while on the demo plan. */
  @Column({ type: 'jsonb', default: {} })
  demo_limit_overrides: Partial<PlanLimits>;

  @Column({ type: 'timestamptz', nullable: true })
  demo_limits_updated_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  demo_limits_updated_by: string | null;

  /** When the demo ends; null = no end date ("free forever"). Only used on the demo plan. */
  @Column({ type: 'timestamptz', nullable: true })
  demo_ends_at: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  demo_period_updated_at: Date | null;

  @Column({ type: 'uuid', nullable: true })
  demo_period_updated_by: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

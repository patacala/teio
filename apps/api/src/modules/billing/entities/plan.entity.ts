import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity({ name: 'plans', schema: 'billing' })
export class PlanEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_price_id_monthly: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_price_id_yearly: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stripe_product_id: string | null;

  @Column({ type: 'int', default: 0 })
  price_monthly: number;

  @Column({ type: 'int', default: 0 })
  price_yearly: number;

  @Column({ type: 'jsonb', default: {} })
  limits: Record<string, number>;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ default: true })
  is_active: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

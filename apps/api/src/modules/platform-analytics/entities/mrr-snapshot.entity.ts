import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { OrganizationEntity } from '../../organizations/organization.entity';

/** What one paying organization contributed to MRR at the end of a month (cents, monthly equivalent). */
@Entity({ name: 'mrr_snapshots', schema: 'billing' })
export class MrrSnapshotEntity {
  /** First day of the month (UTC), "YYYY-MM-DD". */
  @PrimaryColumn({ type: 'date' })
  period_month: string;

  @PrimaryColumn({ type: 'uuid' })
  organization_id: string;

  @ManyToOne(() => OrganizationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization: OrganizationEntity;

  @Column({ type: 'uuid', nullable: true })
  plan_id: string | null;

  @Column({ type: 'varchar', length: 100 })
  plan_name: string;

  @Column({ type: 'varchar', length: 20 })
  billing_period: string;

  @Column({ type: 'int' })
  mrr: number;

  @Column({ type: 'varchar', length: 10, default: 'usd' })
  currency: string;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  captured_at: Date;
}

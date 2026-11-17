import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MrrSnapshotEntity } from './entities/mrr-snapshot.entity';
import { PlatformAnalyticsService } from './platform-analytics.service';

/** Serializes captures across API instances (pg_advisory_xact_lock key). */
const SNAPSHOT_LOCK_KEY = 905_601;

/**
 * Keeps billing.mrr_snapshots current: the current month's rows are replaced
 * with every paying organization's MRR, so when a month closes its rows hold
 * the MRR at its end (within the hour). Past months are never touched.
 */
@Injectable()
export class MrrSnapshotService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MrrSnapshotService.name);

  constructor(
    @InjectRepository(MrrSnapshotEntity)
    private readonly repo: Repository<MrrSnapshotEntity>,
    private readonly analytics: PlatformAnalyticsService,
  ) {}

  onApplicationBootstrap(): void {
    void this.run();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async run(): Promise<void> {
    try {
      const captured = await this.capture();
      this.logger.log(`MRR snapshot: ${captured} paying organization(s)`);
    } catch (err) {
      this.logger.error(`MRR snapshot failed: ${(err as Error).message}`);
    }
  }

  /** Replaces the snapshot of `now`'s month; returns how many organizations it holds. */
  async capture(now: Date = new Date()): Promise<number> {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const paying = (await this.analytics.loadInsights(now)).filter((org) => org.state === 'paying' && org.mrr > 0);

    await this.repo.manager.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [SNAPSHOT_LOCK_KEY]);
      await manager.query('DELETE FROM billing.mrr_snapshots WHERE period_month = $1::date', [month]);
      if (!paying.length) return;
      await manager
        .createQueryBuilder()
        .insert()
        .into(MrrSnapshotEntity)
        .values(
          paying.map((org) => ({
            period_month: month,
            organization_id: org.id,
            plan_id: org.plan_id,
            plan_name: org.plan_name,
            billing_period: org.billing_period,
            mrr: org.mrr,
            currency: 'usd',
            captured_at: now,
          })),
        )
        .execute();
    });
    return paying.length;
  }
}

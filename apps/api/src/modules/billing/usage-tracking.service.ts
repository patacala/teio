import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UsageEntity } from './entities/usage.entity';
import type { PlanLimitMetric } from '@crm/shared';

const METRICS: PlanLimitMetric[] = [
  'conversations',
  'messages',
  'ai_calls',
  'voice_minutes',
];

@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async increment(
    orgId: string,
    metric: PlanLimitMetric,
    delta = 1,
  ): Promise<void> {
    const key = this.redisKey(orgId, metric);
    await this.redis.incrby(key, delta);
    await this.redis.expire(key, 48 * 3600);
    void this.flushToDB(orgId, metric).catch((err) =>
      this.logger.error(`flushToDB error: ${err?.message}`),
    );
  }

  async getCurrentUsage(
    orgId: string,
  ): Promise<Record<PlanLimitMetric, number>> {
    const pipeline = this.redis.pipeline();
    for (const m of METRICS) pipeline.get(this.redisKey(orgId, m));
    const results = await pipeline.exec();
    return Object.fromEntries(
      METRICS.map((m, i) => [m, parseInt(String(results?.[i]?.[1] ?? '0'), 10)]),
    ) as Record<PlanLimitMetric, number>;
  }

  async resetPeriod(
    orgId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    for (const m of METRICS) {
      await this.redis.del(this.redisKey(orgId, m));
    }
    await this.repo.upsert(
      { organization_id: orgId, period_start: periodStart, period_end: periodEnd },
      ['organization_id', 'period_start'],
    );
  }

  private redisKey(orgId: string, metric: string): string {
    const month = new Date().toISOString().slice(0, 7); // "2026-03"
    return `usage:${orgId}:${metric}:${month}`;
  }

  private async flushToDB(
    orgId: string,
    metric: PlanLimitMetric,
  ): Promise<void> {
    const key = this.redisKey(orgId, metric);
    const val = await this.redis.get(key);
    if (!val) return;
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    await this.repo
      .createQueryBuilder()
      .insert()
      .into(UsageEntity)
      .values({
        organization_id: orgId,
        period_start: periodStart,
        period_end: periodEnd,
        [metric]: parseInt(val, 10),
      })
      .orUpdate([metric], ['organization_id', 'period_start'])
      .execute();
  }
}

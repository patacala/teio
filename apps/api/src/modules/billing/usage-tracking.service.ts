import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { UsageEntity } from './entities/usage.entity';
import { METERED_METRICS } from '@crm/shared';
import type { MeteredMetric } from '@crm/shared';

const METRICS: readonly MeteredMetric[] = METERED_METRICS;

/** Keys must outlive their calendar month; the month is part of the key. */
const KEY_TTL_SECONDS = 35 * 24 * 3600;

/**
 * Monthly usage counters: Redis is the fast path, billing.usage (one row per
 * org per UTC month) is the durable copy used whenever Redis lost a key.
 */
@Injectable()
export class UsageTrackingService {
  private readonly logger = new Logger(UsageTrackingService.name);

  constructor(
    @InjectRepository(UsageEntity)
    private readonly repo: Repository<UsageEntity>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async increment(orgId: string, metric: MeteredMetric, delta = 1, now = new Date()): Promise<void> {
    const key = this.redisKey(orgId, metric, now);
    if (!(await this.redis.exists(key))) {
      const stored = await this.findPeriodRow(orgId, now);
      await this.redis.set(key, String(stored?.[metric] ?? 0), 'EX', KEY_TTL_SECONDS, 'NX');
    }
    const value = await this.redis.incrby(key, delta);
    await this.redis.expire(key, KEY_TTL_SECONDS);
    void this.flushToDB(orgId, metric, value, now).catch((err) =>
      this.logger.error(`flushToDB error: ${err?.message}`),
    );
  }

  /**
   * Counts `delta` once per `dedupKey` (e.g. one voice call reported by
   * several webhooks). Returns whether it was counted.
   */
  async incrementOnce(
    orgId: string,
    metric: MeteredMetric,
    delta: number,
    dedupKey: string,
    now = new Date(),
  ): Promise<boolean> {
    const claimed = await this.redis.set(`usage:counted:${metric}:${dedupKey}`, '1', 'EX', KEY_TTL_SECONDS, 'NX');
    if (claimed !== 'OK') return false;
    await this.increment(orgId, metric, delta, now);
    return true;
  }

  async getCurrentUsage(orgId: string, now = new Date()): Promise<Record<MeteredMetric, number>> {
    const pipeline = this.redis.pipeline();
    for (const m of METRICS) pipeline.get(this.redisKey(orgId, m, now));
    const results = await pipeline.exec();
    const cached = METRICS.map((_, i) => results?.[i]?.[1] as string | null | undefined);

    const stored = cached.some((v) => v == null) ? await this.findPeriodRow(orgId, now) : null;
    return Object.fromEntries(
      METRICS.map((m, i) => [m, cached[i] != null ? parseInt(cached[i]!, 10) : (stored?.[m] ?? 0)]),
    ) as Record<MeteredMetric, number>;
  }

  private periodBounds(now: Date): { start: Date; end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    return { start, end };
  }

  private redisKey(orgId: string, metric: string, now: Date): string {
    const month = this.periodBounds(now).start.toISOString().slice(0, 7); // "2026-03"
    return `usage:${orgId}:${metric}:${month}`;
  }

  private findPeriodRow(orgId: string, now: Date): Promise<UsageEntity | null> {
    return this.repo.findOne({
      where: { organization_id: orgId, period_start: this.periodBounds(now).start },
    });
  }

  /** Counters only grow within a month, so out-of-order flushes must never lower them. */
  private async flushToDB(orgId: string, metric: MeteredMetric, value: number, now: Date): Promise<void> {
    if (!METRICS.includes(metric)) return;
    const { start, end } = this.periodBounds(now);
    await this.repo.query(
      `INSERT INTO billing.usage (organization_id, period_start, period_end, ${metric})
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, period_start)
       DO UPDATE SET ${metric} = GREATEST(billing.usage.${metric}, EXCLUDED.${metric}), updated_at = NOW()`,
      [orgId, start, end, value],
    );
  }
}

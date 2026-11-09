import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import type { BillingAccess, PlanFeature, PlanLimitMetric } from '@crm/shared';
import { REDIS_CLIENT } from '../../infrastructure/redis/redis.module';
import { OrganizationEntity } from '../organizations/organization.entity';
import { UserEntity } from '../users/user.entity';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { UsageTrackingService } from './usage-tracking.service';
import {
  resolveBillingAccess,
  resolveDemoEndsAt,
  hasFeature,
  isOperational,
  limitFor,
} from './billing-access.policy';

export const FREE_PLAN_NAME = 'free';
export const DEFAULT_GRACE_PERIOD_HOURS = 48;
const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'billing:access:';

export interface LimitCheck {
  allowed: boolean;
  metric: PlanLimitMetric;
  /** -1 = unlimited */
  limit: number;
  current: number;
}

@Injectable()
export class BillingAccessService {
  private readonly logger = new Logger(BillingAccessService.name);

  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subRepo: Repository<SubscriptionEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly usageTracking: UsageTrackingService,
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async getAccess(orgId: string): Promise<BillingAccess> {
    const cached = await this.readCache(orgId);
    if (cached) return cached;

    const [org, sub, freePlan] = await Promise.all([
      this.orgRepo.findOne({ where: { id: orgId }, select: ['id', 'is_active', 'created_at'] }),
      this.subRepo.findOne({ where: { organization_id: orgId }, relations: ['plan'] }),
      this.planRepo.findOne({ where: { name: FREE_PLAN_NAME } }),
    ]);

    const access = this.resolve(org?.is_active ?? false, sub, freePlan, org?.created_at ?? null);
    await this.writeCache(orgId, access);
    return access;
  }

  /** Pure resolution for callers that already loaded the rows (no cache). */
  resolve(
    organizationActive: boolean,
    sub: SubscriptionEntity | null,
    freePlan: PlanEntity | null,
    organizationCreatedAt: Date | null = null,
  ): BillingAccess {
    const now = new Date();
    const plan = sub?.plan ?? freePlan;

    return resolveBillingAccess(
      {
        organizationActive,
        status: sub?.status ?? 'active',
        plan: plan
          ? {
              name: plan.name,
              price_monthly: plan.price_monthly,
              price_yearly: plan.price_yearly,
              limits: plan.limits,
              features: plan.features,
            }
          : { name: FREE_PLAN_NAME, price_monthly: 0, price_yearly: 0, limits: {}, features: [] },
        paymentMethod: sub?.payment_method_id
          ? { exp_month: sub.payment_method_exp_month, exp_year: sub.payment_method_exp_year }
          : null,
        currentPeriodEnd: sub?.current_period_end ?? now,
        pastDueSince: sub?.past_due_since ?? null,
        cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
        gracePeriodHours: this.gracePeriodHours(),
        demoLimitOverrides: sub?.demo_limit_overrides ?? {},
        demoEndsAt: resolveDemoEndsAt(sub, organizationCreatedAt, freePlan?.demo_duration_days ?? null),
      },
      now,
    );
  }

  /** Whether the org may use the product, including background work (AI replies, automations). */
  async isOperational(orgId: string): Promise<boolean> {
    return isOperational(await this.getAccess(orgId));
  }

  async hasFeature(orgId: string, feature: PlanFeature): Promise<boolean> {
    return hasFeature(await this.getAccess(orgId), feature);
  }

  async getLimit(orgId: string, metric: PlanLimitMetric): Promise<number> {
    return limitFor(await this.getAccess(orgId), metric);
  }

  /** Current month usage, plus active team members for `agents`. */
  async getUsage(orgId: string): Promise<Record<PlanLimitMetric, number>> {
    const [metered, agents] = await Promise.all([
      this.usageTracking.getCurrentUsage(orgId),
      this.userRepo.count({ where: { organization_id: orgId, is_active: true } }),
    ]);
    return { ...metered, agents };
  }

  /** Whether the org may consume `amount` more of `metric` this month. */
  async checkLimit(orgId: string, metric: PlanLimitMetric, amount = 1): Promise<LimitCheck> {
    const limit = await this.getLimit(orgId, metric);
    if (limit === -1) return { allowed: true, metric, limit, current: 0 };
    const current = (await this.getUsage(orgId))[metric] ?? 0;
    return { allowed: current + amount <= limit, metric, limit, current };
  }

  async invalidate(orgId: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.del(this.cacheKey(orgId));
    } catch (err) {
      this.logger.warn(`Billing access cache invalidation failed for ${orgId}: ${(err as Error).message}`);
    }
  }

  /** After changes that affect many organizations (e.g. demo defaults). */
  async invalidateAll(): Promise<void> {
    if (!this.redis) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${CACHE_PREFIX}*`, 'COUNT', 500);
        if (keys.length) await this.redis.del(...keys);
        cursor = next;
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(`Billing access cache flush failed: ${(err as Error).message}`);
    }
  }

  private gracePeriodHours(): number {
    const hours = this.config.get<number>('billing.gracePeriodHours', DEFAULT_GRACE_PERIOD_HOURS);
    return Number.isFinite(hours) && hours >= 0 ? hours : DEFAULT_GRACE_PERIOD_HOURS;
  }

  private cacheKey(orgId: string): string {
    return `${CACHE_PREFIX}${orgId}`;
  }

  private async readCache(orgId: string): Promise<BillingAccess | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(this.cacheKey(orgId));
      return raw ? (JSON.parse(raw) as BillingAccess) : null;
    } catch {
      return null;
    }
  }

  private async writeCache(orgId: string, access: BillingAccess): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.setex(this.cacheKey(orgId), CACHE_TTL_SECONDS, JSON.stringify(access));
    } catch {
      /* cache is best-effort */
    }
  }
}

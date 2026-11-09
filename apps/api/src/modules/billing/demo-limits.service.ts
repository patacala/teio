import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta, PLAN_LIMIT_METRICS } from '@crm/shared';
import type {
  DemoLimitDefaults,
  DemoOrganization,
  PaginatedResponse,
  PlanLimitMetric,
  PlanLimitOverrides,
  PlanLimits,
} from '@crm/shared';
import { OrganizationEntity } from '../organizations/organization.entity';
import { PlanEntity } from './entities/plan.entity';
import { SubscriptionEntity } from './entities/subscription.entity';
import { UsageEntity } from './entities/usage.entity';
import { BillingAccessService, FREE_PLAN_NAME } from './billing-access.service';
import { SubscriptionService } from './subscription.service';
import { cleanOverrides, isPaidPlan, NO_LIMITS, resolveDemoEndsAt } from './billing-access.policy';

interface DemoOrgRow {
  has_billing_row: boolean;
  demo_ends_at: Date | null;
  demo_period_updated_at: Date | null;
  organization_id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: Date;
  demo_limit_overrides: PlanLimitOverrides | null;
  demo_limits_updated_at: Date | null;
  conversations: number | null;
  messages: number | null;
  ai_calls: number | null;
  voice_minutes: number | null;
  agents: string | number;
}

/**
 * Platform-admin management of demo (free plan) limits: the free plan's
 * limits are the defaults for every demo organization, and each organization
 * can get its own overrides.
 */
@Injectable()
export class DemoLimitsService {
  constructor(
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subRepo: Repository<SubscriptionEntity>,
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    private readonly subscriptions: SubscriptionService,
    private readonly billingAccess: BillingAccessService,
  ) {}

  async getDefaults(): Promise<DemoLimitDefaults> {
    const plan = await this.demoPlan();
    return {
      plan_id: plan.id,
      limits: this.fullLimits(plan.limits),
      demo_duration_days: plan.demo_duration_days ?? null,
      updated_at: (plan.updated_at ?? plan.created_at).toISOString(),
    };
  }

  /**
   * Changes the default limits (omitted metrics stay as they are) and/or the
   * length of new demos. Existing demos keep their end date.
   */
  async updateDefaults(
    limits: PlanLimitOverrides,
    demoDurationDays?: number | null,
  ): Promise<DemoLimitDefaults> {
    const plan = await this.demoPlan();
    const next = { ...this.fullLimits(plan.limits), ...cleanOverrides(limits) };
    await this.planRepo.update(
      { id: plan.id },
      demoDurationDays === undefined ? { limits: next } : { limits: next, demo_duration_days: demoDurationDays },
    );
    await this.billingAccess.invalidateAll();
    return this.getDefaults();
  }

  async listOrganizations(
    search: string | undefined,
    page: number,
    limit: number,
  ): Promise<PaginatedResponse<DemoOrganization>> {
    const plan = await this.demoPlan();
    const defaults = this.fullLimits(plan.limits);
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const where = [
      `(s.id IS NULL OR (p.price_monthly = 0 AND p.price_yearly = 0))`,
      ...(search?.trim() ? [`(o.name ILIKE :search OR o.slug ILIKE :search)`] : []),
    ].join(' AND ');
    const params = { search: `%${search?.trim() ?? ''}%`, periodStart };

    const base = this.orgRepo
      .createQueryBuilder('o')
      .leftJoin(SubscriptionEntity, 's', 's.organization_id = o.id')
      .leftJoin(PlanEntity, 'p', 'p.id = s.plan_id')
      .where(where, params);

    const total = await base.clone().getCount();
    const rows = await base
      .clone()
      .leftJoin(UsageEntity, 'u', 'u.organization_id = o.id AND u.period_start = :periodStart', params)
      .select([
        'o.id AS organization_id',
        'o.name AS name',
        'o.slug AS slug',
        'o.is_active AS is_active',
        'o.created_at AS created_at',
        's.id IS NOT NULL AS has_billing_row',
        's.demo_ends_at AS demo_ends_at',
        's.demo_period_updated_at AS demo_period_updated_at',
        's.demo_limit_overrides AS demo_limit_overrides',
        's.demo_limits_updated_at AS demo_limits_updated_at',
        'u.conversations AS conversations',
        'u.messages AS messages',
        'u.ai_calls AS ai_calls',
        'u.voice_minutes AS voice_minutes',
        '(SELECT COUNT(*) FROM core.users cu WHERE cu.organization_id = o.id AND cu.is_active = true) AS agents',
      ])
      .orderBy('o.created_at', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<DemoOrgRow>();

    return {
      items: rows.map((row) => {
        const overrides = cleanOverrides(row.demo_limit_overrides);
        return {
          organization_id: row.organization_id,
          name: row.name,
          slug: row.slug,
          is_active: row.is_active,
          created_at: new Date(row.created_at).toISOString(),
          usage: {
            conversations: row.conversations ?? 0,
            messages: row.messages ?? 0,
            ai_calls: row.ai_calls ?? 0,
            voice_minutes: row.voice_minutes ?? 0,
            agents: Number(row.agents ?? 0),
          },
          limit_overrides: overrides,
          effective_limits: { ...defaults, ...overrides },
          limits_updated_at: row.demo_limits_updated_at ? new Date(row.demo_limits_updated_at).toISOString() : null,
          demo_ends_at:
            resolveDemoEndsAt(
              row.has_billing_row ? { demo_ends_at: row.demo_ends_at ? new Date(row.demo_ends_at) : null } : null,
              new Date(row.created_at),
              plan.demo_duration_days,
            )?.toISOString() ?? null,
          demo_period_updated_at: row.demo_period_updated_at ? new Date(row.demo_period_updated_at).toISOString() : null,
        };
      }),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  /** Replaces the organization's overrides; metrics left out use the defaults. */
  async setOverrides(orgId: string, limits: PlanLimitOverrides, actorUserId: string | null): Promise<void> {
    const sub = await this.demoSubscription(orgId);
    await this.subRepo.update(
      { id: sub.id },
      {
        demo_limit_overrides: cleanOverrides(limits),
        demo_limits_updated_at: new Date(),
        demo_limits_updated_by: actorUserId,
      },
    );
    await this.billingAccess.invalidate(orgId);
  }

  /** Moves the end of one organization's demo; null = no end date ("free forever"). */
  async setDemoPeriod(orgId: string, endsAt: Date | null, actorUserId: string | null): Promise<void> {
    const sub = await this.demoSubscription(orgId);
    await this.subRepo.update(
      { id: sub.id },
      { demo_ends_at: endsAt, demo_period_updated_at: new Date(), demo_period_updated_by: actorUserId },
    );
    await this.billingAccess.invalidate(orgId);
  }

  async clearOverrides(orgId: string, actorUserId: string | null): Promise<void> {
    await this.setOverrides(orgId, {}, actorUserId);
  }

  private async demoSubscription(orgId: string): Promise<SubscriptionEntity> {
    const org = await this.orgRepo.findOne({ where: { id: orgId }, select: ['id'] });
    if (!org) throw new NotFoundException('Organization not found');
    const sub = await this.subscriptions.getOrCreateForOrg(orgId);
    if (isPaidPlan(sub.plan)) {
      throw new ConflictException('This organization is on a paid plan; demo limits do not apply to it.');
    }
    return sub;
  }

  private async demoPlan(): Promise<PlanEntity> {
    const plan = await this.planRepo.findOne({ where: { name: FREE_PLAN_NAME } });
    if (!plan) throw new ServiceUnavailableException('The demo plan is not configured.');
    return plan;
  }

  private fullLimits(limits: Partial<PlanLimits> | null | undefined): PlanLimits {
    const out = { ...NO_LIMITS };
    for (const metric of PLAN_LIMIT_METRICS as readonly PlanLimitMetric[]) {
      const value = limits?.[metric];
      if (typeof value === 'number') out[metric] = value;
    }
    return out;
  }
}

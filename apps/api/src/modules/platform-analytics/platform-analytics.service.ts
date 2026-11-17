import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPaginationMeta, MagicLinkType, PLATFORM_LEAD_FUNNEL_STEPS } from '@crm/shared';
import type {
  BillingPeriod,
  DemoRequestStatus,
  DemoType,
  PlanLimits,
  PlatformAttention,
  PlatformLead,
  PlatformLeadSourceFilter,
  PlatformOrganizationCounts,
  PlatformOrganizationFilter,
  PlatformOrganizationRow,
  PlatformOrganizationSort,
  PlatformOrganizationsPage,
  PlatformOverview,
  PlatformPeriod,
  PlatformRange,
  PlatformRevenueMonth,
  PaginatedResponse,
  SubscriptionStatus,
} from '@crm/shared';
import { PLATFORM_ORGANIZATION_FILTERS } from '@crm/shared';
import { OrganizationEntity } from '../organizations/organization.entity';
import { PlanEntity } from '../billing/entities/plan.entity';
import type { SubscriptionEntity } from '../billing/entities/subscription.entity';
import { BillingAccessService, FREE_PLAN_NAME } from '../billing/billing-access.service';
import {
  buildInsight,
  compareAttention,
  DEMO_ENDING_SOON_DAYS,
  DEMO_REQUEST_ATTENTION_DAYS,
  DEMO_REQUEST_STUCK_MINUTES,
  isAtRisk,
  leadAttention,
  leadName,
  organizationAttention,
  riskFlags,
} from './organization-insights';
import type { DemoRequestFacts, OrganizationFacts, OrganizationInsight } from './organization-insights';

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS: Record<PlatformRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
/** Longest custom period accepted (two years). */
const MAX_CUSTOM_DAYS = 731;
const REVENUE_MONTHS = 12;
/** The attention list is a to-do list, not a report: only the most urgent items are returned. */
const ATTENTION_LIMIT = 50;

export interface OverviewQuery {
  range?: PlatformRange;
  /** Custom period, "YYYY-MM-DD" (UTC), both inclusive. */
  from?: string;
  to?: string;
}

export interface LeadsQuery {
  source?: PlatformLeadSourceFilter;
  search?: string;
  page?: number;
  limit?: number;
}

export interface OrganizationsQuery {
  filter?: PlatformOrganizationFilter;
  search?: string;
  sort?: PlatformOrganizationSort;
  page?: number;
  limit?: number;
}

interface ResolvedPeriod {
  from: Date;
  to: Date;
  previousFrom: Date;
  days: number;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  is_internal: boolean;
  created_at: Date;
  subscription_id: string | null;
  status: SubscriptionStatus | null;
  billing_period: BillingPeriod | null;
  current_period_end: Date | null;
  past_due_since: Date | null;
  cancel_at_period_end: boolean | null;
  payment_method_id: string | null;
  payment_method_exp_month: number | null;
  payment_method_exp_year: number | null;
  demo_limit_overrides: Partial<PlanLimits> | null;
  demo_ends_at: Date | null;
  subscription_updated_at: Date | null;
  subscription_deleted_at: Date | null;
  plan_id: string | null;
  plan_name: string | null;
  price_monthly: number | null;
  price_yearly: number | null;
  plan_limits: Partial<PlanLimits> | null;
  plan_features: string[] | null;
  conversations: number;
  messages: number;
  ai_calls: number;
  voice_minutes: number;
  members: number;
  owner_email: string | null;
  channels: number;
  has_conversations: boolean;
  last_activity_at: Date | null;
  first_paid_at: Date | null;
  lifetime_revenue: string | number;
}

interface LeadRow {
  id: string;
  source: 'demo_request' | 'signup';
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  created_at: Date;
  demo_type: DemoType | null;
  demo_status: DemoRequestStatus | null;
  demo_opens: number | null;
  organization_id: string | null;
}

const toNumber = (value: unknown): number => Number(value ?? 0) || 0;
const iso = (date: Date | null | undefined): string | null => (date ? date.toISOString() : null);
const inPeriod = (date: Date | null, period: { from: Date; to: Date }) =>
  !!date && date.getTime() >= period.from.getTime() && date.getTime() < period.to.getTime();
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const escapeLike = (term: string) => term.replace(/[\\%_]/g, (char) => `\\${char}`);
const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const startOfUtcMonth = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

function parseDay(value: string, field: string): Date {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(NaN);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(`${field} must be a date (YYYY-MM-DD)`);
  }
  return date;
}

/**
 * Read-only figures for the platform (super admin) dashboard, across every
 * organization except internal ones. Organizations are classified with the
 * billing access policy itself (`BillingAccessService.resolve`).
 */
@Injectable()
export class PlatformAnalyticsService {
  constructor(
    @InjectRepository(OrganizationEntity)
    private readonly orgRepo: Repository<OrganizationEntity>,
    @InjectRepository(PlanEntity)
    private readonly planRepo: Repository<PlanEntity>,
    private readonly billingAccess: BillingAccessService,
  ) {}

  // ── Period ───────────────────────────────────────────────────────────────

  /** [from, to) plus the same length immediately before it, for trends. */
  resolvePeriod(query: OverviewQuery, now: Date): ResolvedPeriod {
    let from: Date;
    let to: Date;
    if (query.from || query.to) {
      if (!query.from || !query.to) throw new BadRequestException('A custom period needs both from and to');
      from = parseDay(query.from, 'from');
      to = new Date(parseDay(query.to, 'to').getTime() + DAY_MS); // "to" is inclusive
      if (from.getTime() >= to.getTime()) throw new BadRequestException('from must be on or before to');
      if (to.getTime() - from.getTime() > MAX_CUSTOM_DAYS * DAY_MS) {
        throw new BadRequestException(`A custom period can be at most ${MAX_CUSTOM_DAYS} days`);
      }
      if (from.getTime() > now.getTime()) throw new BadRequestException('from cannot be in the future');
      if (to.getTime() > now.getTime()) to = new Date(now);
    } else {
      const days = RANGE_DAYS[query.range ?? '30d'];
      to = new Date(now);
      from = new Date(now.getTime() - days * DAY_MS);
    }
    const length = to.getTime() - from.getTime();
    return {
      from,
      to,
      previousFrom: new Date(from.getTime() - length),
      days: Math.max(1, Math.round(length / DAY_MS)),
    };
  }

  // ── Organizations (shared by every view) ────────────────────────────────

  /** Every organization (internal ones included, flagged) with its billing state and activity. */
  async loadInsights(now: Date = new Date()): Promise<OrganizationInsight[]> {
    const [rows, freePlan] = await Promise.all([
      this.orgRepo.query(
        `SELECT
           o.id, o.name, o.slug, o.is_active, o.is_internal, o.created_at,
           s.id AS subscription_id, s.status, s.billing_period, s.current_period_end, s.past_due_since,
           s.cancel_at_period_end, s.payment_method_id, s.payment_method_exp_month, s.payment_method_exp_year,
           s.demo_limit_overrides, s.demo_ends_at, s.updated_at AS subscription_updated_at,
           p.id AS plan_id, p.name AS plan_name, p.price_monthly, p.price_yearly,
           p.limits AS plan_limits, p.features AS plan_features,
           COALESCE(u.conversations, 0) AS conversations,
           COALESCE(u.messages, 0) AS messages,
           COALESCE(u.ai_calls, 0) AS ai_calls,
           COALESCE(u.voice_minutes, 0) AS voice_minutes,
           (SELECT COUNT(*)::int FROM core.users cu WHERE cu.organization_id = o.id AND cu.is_active) AS members,
           (SELECT cu.email FROM core.users cu
             WHERE cu.organization_id = o.id AND cu.is_active
             ORDER BY CASE cu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cu.created_at
             LIMIT 1) AS owner_email,
           (SELECT COUNT(*)::int FROM integrations.channels ch WHERE ch.organization_id = o.id) AS channels,
           EXISTS (SELECT 1 FROM conversations.conversations cv WHERE cv.organization_id = o.id) AS has_conversations,
           GREATEST(
             (SELECT MAX(cu.last_seen_at) FROM core.users cu WHERE cu.organization_id = o.id),
             (SELECT MAX(bu.updated_at) FROM billing.usage bu WHERE bu.organization_id = o.id)
           ) AS last_activity_at,
           inv.first_paid_at,
           COALESCE(inv.lifetime_revenue, 0) AS lifetime_revenue,
           (SELECT MAX(se.created_at) FROM billing.stripe_events se
             WHERE se.organization_id = o.id AND se.type = 'customer.subscription.deleted') AS subscription_deleted_at
         FROM core.organizations o
         LEFT JOIN billing.subscriptions s ON s.organization_id = o.id
         LEFT JOIN billing.plans p ON p.id = s.plan_id
         LEFT JOIN billing.usage u ON u.organization_id = o.id AND u.period_start = $1
         LEFT JOIN LATERAL (
           SELECT MIN(i.paid_at) FILTER (WHERE i.amount_paid > 0) AS first_paid_at,
                  SUM(i.amount_paid) FILTER (WHERE LOWER(i.currency) = 'usd') AS lifetime_revenue
           FROM billing.invoices i
           WHERE i.organization_id = o.id AND i.status = 'paid'
         ) inv ON true`,
        [startOfUtcMonth(now)],
      ) as Promise<OrganizationRow[]>,
      this.planRepo.findOne({ where: { name: FREE_PLAN_NAME } }),
    ]);
    return rows.map((row) => this.toInsight(row, freePlan, now));
  }

  private toInsight(row: OrganizationRow, freePlan: PlanEntity | null, now: Date): OrganizationInsight {
    const plan = row.plan_id
      ? {
          id: row.plan_id,
          name: row.plan_name ?? FREE_PLAN_NAME,
          price_monthly: toNumber(row.price_monthly),
          price_yearly: toNumber(row.price_yearly),
          limits: row.plan_limits ?? {},
          features: row.plan_features ?? [],
        }
      : null;
    const subscription = row.subscription_id
      ? ({
          status: row.status ?? 'active',
          plan,
          payment_method_id: row.payment_method_id,
          payment_method_exp_month: row.payment_method_exp_month,
          payment_method_exp_year: row.payment_method_exp_year,
          current_period_end: row.current_period_end ?? now,
          past_due_since: row.past_due_since,
          cancel_at_period_end: row.cancel_at_period_end ?? false,
          demo_limit_overrides: row.demo_limit_overrides ?? {},
          demo_ends_at: row.demo_ends_at,
        } as unknown as SubscriptionEntity)
      : null;
    const access = this.billingAccess.resolve(row.is_active, subscription, freePlan, row.created_at);
    const effectivePlan = plan ?? {
      id: freePlan?.id ?? null,
      name: freePlan?.name ?? FREE_PLAN_NAME,
      price_monthly: freePlan?.price_monthly ?? 0,
      price_yearly: freePlan?.price_yearly ?? 0,
    };
    const status = (row.status ?? 'active') as SubscriptionStatus;

    const facts: OrganizationFacts = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      is_active: row.is_active,
      is_internal: row.is_internal,
      created_at: row.created_at,
      owner_email: row.owner_email,
      plan_id: effectivePlan.id,
      plan_name: effectivePlan.name,
      price_monthly: effectivePlan.price_monthly,
      price_yearly: effectivePlan.price_yearly,
      subscription_status: status,
      billing_period: row.billing_period ?? 'monthly',
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end ?? false,
      payment_method_exp_month: row.payment_method_id ? row.payment_method_exp_month : null,
      payment_method_exp_year: row.payment_method_id ? row.payment_method_exp_year : null,
      canceled_at: status === 'canceled' ? (row.subscription_deleted_at ?? row.subscription_updated_at) : null,
      usage: {
        conversations: toNumber(row.conversations),
        messages: toNumber(row.messages),
        ai_calls: toNumber(row.ai_calls),
        voice_minutes: toNumber(row.voice_minutes),
        agents: toNumber(row.members),
      },
      members: toNumber(row.members),
      channels: toNumber(row.channels),
      has_conversations: row.has_conversations,
      last_activity_at: row.last_activity_at,
      first_paid_at: row.first_paid_at,
      lifetime_revenue: toNumber(row.lifetime_revenue),
    };
    return buildInsight(facts, access);
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  async getOverview(query: OverviewQuery, now: Date = new Date()): Promise<PlatformOverview> {
    const period = this.resolvePeriod(query, now);
    const [insights, cash, demoRequests, funnel, revenueByMonth] = await Promise.all([
      this.loadInsights(now),
      this.cashFigures(period),
      this.demoRequestCounts(period),
      this.leadFunnel(period),
      this.revenueByMonth(now),
    ]);
    const external = insights.filter((org) => !org.is_internal);
    const previous = { from: period.previousFrom, to: period.from };

    const paying = external.filter((org) => org.state === 'paying');
    const mrr = sum(paying.map((org) => org.mrr));
    const atRisk = external
      .map((org) => ({ org, flags: riskFlags(org, now) }))
      .filter(({ flags }) => isAtRisk(flags));

    const signups = external.filter((org) => inPeriod(org.created_at, period));
    const previousSignups = external.filter((org) => inPeriod(org.created_at, previous)).length;
    const demos = external.filter((org) => org.state === 'demo');
    const endingSoon = now.getTime() + DEMO_ENDING_SOON_DAYS * DAY_MS;
    const converted = external.filter((org) => inPeriod(org.first_paid_at, period)).length;
    const expiredUnpaid = external.filter(
      (org) => org.state === 'demo_expired' && inPeriod(org.demo_ends_at, period),
    ).length;
    const decided = converted + expiredUnpaid;
    const lastMonth = revenueByMonth[revenueByMonth.length - 2];
    const months = revenueByMonth.map((month, index) =>
      index === revenueByMonth.length - 1 ? { ...month, mrr } : month,
    );

    return {
      period: this.toPeriod(period),
      currency: 'usd',
      money: {
        mrr,
        mrr_last_month: lastMonth?.mrr ?? null,
        arr: mrr * 12,
        paying_organizations: paying.length,
        average_revenue_per_organization: paying.length ? Math.round(mrr / paying.length) : 0,
        cash_collected: cash.current,
        cash_collected_previous: cash.previous,
        outstanding: cash.outstanding,
        outstanding_invoices: cash.outstandingInvoices,
        at_risk: {
          amount: sum(atRisk.map(({ org }) => org.mrr)),
          organizations: atRisk.length,
          past_due: atRisk.filter(({ flags }) => flags.past_due).length,
          cancel_scheduled: atRisk.filter(({ flags }) => flags.cancel_scheduled).length,
          payment_method_issue: atRisk.filter(({ flags }) => flags.payment_method_issue).length,
          payment_failed: atRisk.filter(({ flags }) => flags.payment_failed).length,
        },
        new_paying: converted,
        churned: external.filter((org) => org.state === 'churned' && inPeriod(org.canceled_at, period)).length,
      },
      growth: {
        leads: {
          total: demoRequests.current + signups.length,
          previous: demoRequests.previous + previousSignups,
          demo_requests: demoRequests.current,
          signups: signups.length,
        },
        demos: {
          active: demos.length,
          ending_7d: demos.filter((org) => org.demo_ends_at && org.demo_ends_at.getTime() <= endingSoon).length,
          no_end_date: demos.filter((org) => !org.demo_ends_at).length,
        },
        conversion: {
          rate: decided ? Math.round((converted / decided) * 100) : null,
          converted,
          expired_unpaid: expiredUnpaid,
        },
      },
      lead_funnel: funnel,
      signups: {
        signups: signups.length,
        activated: signups.filter((org) => org.channels > 0 || org.has_conversations).length,
        paid: signups.filter((org) => !!org.first_paid_at).length,
      },
      revenue_by_month: months,
      generated_at: now.toISOString(),
    };
  }

  private toPeriod(period: ResolvedPeriod): PlatformPeriod {
    return {
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      days: period.days,
      previous_from: period.previousFrom.toISOString(),
      previous_to: period.from.toISOString(),
    };
  }

  /** USD invoices of external organizations: collected in the period (and the previous one), still open now. */
  private async cashFigures(period: ResolvedPeriod) {
    const [row] = (await this.orgRepo.query(
      `SELECT
         COALESCE(SUM(i.amount_paid) FILTER (WHERE i.status = 'paid' AND i.paid_at >= $1 AND i.paid_at < $2), 0) AS current,
         COALESCE(SUM(i.amount_paid) FILTER (WHERE i.status = 'paid' AND i.paid_at >= $3 AND i.paid_at < $1), 0) AS previous,
         COALESCE(SUM(GREATEST(i.amount_due - i.amount_paid, 0)) FILTER (WHERE i.status = 'open'), 0) AS outstanding,
         COUNT(*) FILTER (WHERE i.status = 'open') AS outstanding_invoices
       FROM billing.invoices i
       JOIN core.organizations o ON o.id = i.organization_id AND o.is_internal = false
       WHERE LOWER(i.currency) = 'usd'`,
      [period.from, period.to, period.previousFrom],
    )) as Array<Record<string, string>>;
    return {
      current: toNumber(row?.current),
      previous: toNumber(row?.previous),
      outstanding: toNumber(row?.outstanding),
      outstandingInvoices: toNumber(row?.outstanding_invoices),
    };
  }

  private async demoRequestCounts(period: ResolvedPeriod) {
    const [row] = (await this.orgRepo.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= $1 AND created_at < $2) AS current,
         COUNT(*) FILTER (WHERE created_at >= $3 AND created_at < $1) AS previous
       FROM clients.demo_requests
       WHERE created_at >= $3 AND created_at < $2`,
      [period.from, period.to, period.previousFrom],
    )) as Array<Record<string, string>>;
    return { current: toNumber(row?.current), previous: toNumber(row?.previous) };
  }

  /**
   * Demo requests submitted in the period, followed to where they are now.
   * "Signed up" matches the lead's email with an account in an external organization.
   */
  private async leadFunnel(period: ResolvedPeriod): Promise<PlatformOverview['lead_funnel']> {
    const [row] = (await this.orgRepo.query(
      `WITH cohort AS (
         SELECT dr.id, dr.status, c.email, ml.uses_count
         FROM clients.demo_requests dr
         LEFT JOIN clients.contacts c ON c.id = dr.contact_id
         LEFT JOIN core.magic_links ml ON ml.id = dr.experience_token_id
         WHERE dr.created_at >= $1 AND dr.created_at < $2
       ),
       matched AS (
         SELECT cohort.*, m.organization_id
         FROM cohort
         LEFT JOIN LATERAL (
           SELECT u.organization_id
           FROM core.users u
           JOIN core.organizations uo ON uo.id = u.organization_id AND uo.is_internal = false
           WHERE cohort.email IS NOT NULL AND LOWER(u.email) = LOWER(cohort.email)
           ORDER BY u.created_at
           LIMIT 1
         ) m ON true
       )
       SELECT
         (SELECT COUNT(*) FROM core.magic_links
           WHERE type = $3 AND created_at >= $1 AND created_at < $2) AS form_started,
         COUNT(*) AS submitted,
         COUNT(*) FILTER (WHERE status = 'ready') AS ready,
         COUNT(*) FILTER (WHERE COALESCE(uses_count, 0) > 0) AS opened,
         COUNT(*) FILTER (WHERE organization_id IS NOT NULL) AS signed_up,
         COUNT(*) FILTER (WHERE organization_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM billing.invoices i
           WHERE i.organization_id = matched.organization_id AND i.status = 'paid' AND i.amount_paid > 0
         )) AS paid
       FROM matched`,
      [period.from, period.to, MagicLinkType.DEMO_INIT],
    )) as Array<Record<string, string>>;
    return PLATFORM_LEAD_FUNNEL_STEPS.map((key) => ({ key, count: toNumber(row?.[key]) }));
  }

  /**
   * The last 12 months (current one included): cash collected and MRR at the
   * end of each month from the snapshots. Months before the first snapshot
   * have no MRR; the caller replaces the current month's with the live figure.
   */
  private async revenueByMonth(now: Date): Promise<PlatformRevenueMonth[]> {
    const first = startOfUtcMonth(now, -(REVENUE_MONTHS - 1));
    const [collected, snapshots, firstSnapshot] = await Promise.all([
      this.orgRepo.query(
        `SELECT to_char(i.paid_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, SUM(i.amount_paid) AS collected
         FROM billing.invoices i
         JOIN core.organizations o ON o.id = i.organization_id AND o.is_internal = false
         WHERE i.status = 'paid' AND LOWER(i.currency) = 'usd' AND i.paid_at >= $1
         GROUP BY 1`,
        [first],
      ) as Promise<Array<{ month: string; collected: string }>>,
      this.orgRepo.query(
        `SELECT to_char(ms.period_month, 'YYYY-MM') AS month, SUM(ms.mrr) AS mrr
         FROM billing.mrr_snapshots ms
         JOIN core.organizations o ON o.id = ms.organization_id AND o.is_internal = false
         WHERE ms.period_month >= $1::date
         GROUP BY 1`,
        [first.toISOString().slice(0, 10)],
      ) as Promise<Array<{ month: string; mrr: string }>>,
      this.orgRepo.query(`SELECT to_char(MIN(period_month), 'YYYY-MM') AS month FROM billing.mrr_snapshots`) as Promise<
        Array<{ month: string | null }>
      >,
    ]);
    const collectedBy = new Map(collected.map((row) => [row.month, toNumber(row.collected)]));
    const mrrBy = new Map(snapshots.map((row) => [row.month, toNumber(row.mrr)]));
    const firstSnapshotMonth = firstSnapshot[0]?.month ?? null;

    return Array.from({ length: REVENUE_MONTHS }, (_, index) => {
      const month = monthKey(startOfUtcMonth(first, index));
      const snapshotted = firstSnapshotMonth !== null && month >= firstSnapshotMonth;
      return {
        month,
        collected: collectedBy.get(month) ?? 0,
        mrr: snapshotted ? (mrrBy.get(month) ?? 0) : null,
      };
    });
  }

  // ── Needs attention ──────────────────────────────────────────────────────

  async getAttention(now: Date = new Date()): Promise<PlatformAttention> {
    const [insights, leads] = await Promise.all([this.loadInsights(now), this.leadsNeedingAttention(now)]);
    const items = [
      ...insights.flatMap((org) => organizationAttention(org, now)),
      ...leads.map((lead) => leadAttention(lead, now)).filter((item) => item !== null),
    ].sort(compareAttention);
    return {
      items: items.slice(0, ATTENTION_LIMIT),
      counts: {
        critical: items.filter((item) => item.urgency === 'critical').length,
        warning: items.filter((item) => item.urgency === 'warning').length,
      },
    };
  }

  private leadsNeedingAttention(now: Date): Promise<DemoRequestFacts[]> {
    return this.orgRepo.query(
      `SELECT dr.id, dr.status, dr.error_message, dr.created_at, dr.demo_type,
              c.first_name, c.last_name, c.email, co.name AS company
       FROM clients.demo_requests dr
       LEFT JOIN clients.contacts c ON c.id = dr.contact_id
       LEFT JOIN clients.companies co ON co.id = dr.company_id
       WHERE dr.created_at >= $1
         AND (dr.status = 'failed' OR (dr.status = 'processing' AND dr.created_at <= $2))
       ORDER BY dr.created_at DESC
       LIMIT ${ATTENTION_LIMIT}`,
      [
        new Date(now.getTime() - DEMO_REQUEST_ATTENTION_DAYS * DAY_MS),
        new Date(now.getTime() - DEMO_REQUEST_STUCK_MINUTES * 60 * 1000),
      ],
    );
  }

  // ── Leads ────────────────────────────────────────────────────────────────

  /** Demo form requests and self-service signups, newest first. */
  async listLeads(query: LeadsQuery, now: Date = new Date()): Promise<PaginatedResponse<PlatformLead>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const source = query.source ?? 'all';
    const search = query.search?.trim() ? `%${escapeLike(query.search.trim())}%` : null;

    const leadsCte = `
      WITH leads AS (
        SELECT dr.id, 'demo_request' AS source, c.first_name, c.last_name, c.email,
               co.name AS company, dr.created_at, dr.demo_type, dr.status AS demo_status,
               COALESCE(ml.uses_count, 0) AS demo_opens, m.organization_id
        FROM clients.demo_requests dr
        LEFT JOIN clients.contacts c ON c.id = dr.contact_id
        LEFT JOIN clients.companies co ON co.id = dr.company_id
        LEFT JOIN core.magic_links ml ON ml.id = dr.experience_token_id
        LEFT JOIN LATERAL (
          SELECT u.organization_id
          FROM core.users u
          JOIN core.organizations uo ON uo.id = u.organization_id AND uo.is_internal = false
          WHERE c.email IS NOT NULL AND LOWER(u.email) = LOWER(c.email)
          ORDER BY u.created_at
          LIMIT 1
        ) m ON true
        UNION ALL
        SELECT o.id, 'signup', o.name, NULL,
               (SELECT cu.email FROM core.users cu
                 WHERE cu.organization_id = o.id
                 ORDER BY CASE cu.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cu.created_at
                 LIMIT 1),
               NULL, o.created_at, NULL, NULL, NULL, o.id
        FROM core.organizations o
        WHERE o.is_internal = false
      )
      SELECT * FROM leads
      WHERE ($1::text = 'all' OR source = $1::text)
        AND ($2::text IS NULL
             OR CONCAT_WS(' ', first_name, last_name) ILIKE $2::text
             OR email ILIKE $2::text
             OR company ILIKE $2::text)`;

    const [rows, countRows, insights] = await Promise.all([
      this.orgRepo.query(`${leadsCte} ORDER BY created_at DESC, id LIMIT $3 OFFSET $4`, [
        source,
        search,
        limit,
        (page - 1) * limit,
      ]) as Promise<LeadRow[]>,
      this.orgRepo.query(`SELECT COUNT(*) AS total FROM (${leadsCte}) filtered`, [source, search]) as Promise<
        Array<{ total: string }>
      >,
      this.loadInsights(now),
    ]);
    const organizations = new Map(insights.map((org) => [org.id, org]));

    return {
      items: rows.map((row) => {
        const org = row.organization_id ? organizations.get(row.organization_id) : undefined;
        const isDemo = row.source === 'demo_request';
        return {
          id: row.id,
          source: row.source,
          name: isDemo ? leadName(row) : (row.first_name ?? 'Unnamed organization'),
          email: row.email,
          company: isDemo ? row.company : null,
          created_at: row.created_at.toISOString(),
          demo_type: row.demo_type,
          demo_status: row.demo_status,
          demo_opens: isDemo ? toNumber(row.demo_opens) : null,
          organization: org ? { id: org.id, name: org.name, state: org.state } : null,
        };
      }),
      meta: buildPaginationMeta(toNumber(countRows[0]?.total), page, limit),
    };
  }

  // ── Organizations table ──────────────────────────────────────────────────

  async listOrganizations(query: OrganizationsQuery, now: Date = new Date()): Promise<PlatformOrganizationsPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = query.filter ?? 'all';
    const sort = query.sort ?? 'mrr';
    const term = query.search?.trim().toLowerCase() ?? '';

    const insights = await this.loadInsights(now);
    const searched = term
      ? insights.filter((org) =>
          [org.name, org.slug, org.owner_email ?? ''].some((value) => value.toLowerCase().includes(term)),
        )
      : insights;

    const counts = Object.fromEntries(
      PLATFORM_ORGANIZATION_FILTERS.map((f) => [f, searched.filter((org) => this.matchesFilter(org, f, now)).length]),
    ) as PlatformOrganizationCounts;
    const matching = searched.filter((org) => this.matchesFilter(org, filter, now)).sort(this.sorter(sort));
    const items = matching.slice((page - 1) * limit, page * limit).map((org) => this.toRow(org));

    return { items, meta: buildPaginationMeta(matching.length, page, limit), counts };
  }

  private matchesFilter(org: OrganizationInsight, filter: PlatformOrganizationFilter, now: Date): boolean {
    if (filter === 'internal') return org.is_internal;
    if (org.is_internal) return false;
    if (filter === 'all') return true;
    if (filter === 'ending_soon') {
      return (
        org.state === 'demo' &&
        !!org.demo_ends_at &&
        org.demo_ends_at.getTime() <= now.getTime() + DEMO_ENDING_SOON_DAYS * DAY_MS
      );
    }
    return org.state === filter;
  }

  private sorter(sort: PlatformOrganizationSort) {
    const time = (date: Date | null) => date?.getTime() ?? null;
    const desc = (a: number | null, b: number | null) => (b ?? -Infinity) - (a ?? -Infinity);
    const asc = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
    const newest = (a: OrganizationInsight, b: OrganizationInsight) => b.created_at.getTime() - a.created_at.getTime();
    return (a: OrganizationInsight, b: OrganizationInsight): number => {
      switch (sort) {
        case 'created':
          return newest(a, b);
        case 'activity':
          return desc(time(a.last_activity_at), time(b.last_activity_at)) || newest(a, b);
        case 'demo_end':
          return asc(time(a.demo_ends_at), time(b.demo_ends_at)) || newest(a, b);
        case 'mrr':
        default:
          return b.mrr - a.mrr || b.lifetime_revenue - a.lifetime_revenue || newest(a, b);
      }
    };
  }

  private toRow(org: OrganizationInsight): PlatformOrganizationRow {
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      owner_email: org.owner_email,
      created_at: org.created_at.toISOString(),
      is_active: org.is_active,
      is_internal: org.is_internal,
      state: org.state,
      reasons: org.access.reasons,
      plan_name: org.plan_name,
      subscription_status: org.subscription_status,
      billing_period: org.billing_period,
      mrr: org.mrr,
      demo_ends_at: iso(org.demo_ends_at),
      renews_at: org.access.is_paid_plan ? iso(org.current_period_end) : null,
      usage_peak: org.usage_peak,
      members: org.members,
      channels: org.channels,
      last_activity_at: iso(org.last_activity_at),
      lifetime_revenue: org.lifetime_revenue,
    };
  }
}


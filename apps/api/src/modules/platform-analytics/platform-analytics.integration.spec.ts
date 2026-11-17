/**
 * Runs against a real PostgreSQL built from packages/database/schemas:
 *   TEST_DATABASE_URL=postgres://... pnpm --filter @crm/api test platform-analytics.integration
 * Skipped when TEST_DATABASE_URL is not set.
 *
 * Platform metrics span every organization, so each test runs in a transaction
 * that hides everything already in the database (marked internal), seeds its
 * own platform and is rolled back afterwards.
 */
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';
import type { PlatformAttentionItem } from '@crm/shared';
import { OrganizationEntity } from '../organizations/organization.entity';
import { PlanEntity } from '../billing/entities/plan.entity';
import { BillingAccessService } from '../billing/billing-access.service';
import { MrrSnapshotEntity } from './entities/mrr-snapshot.entity';
import { MrrSnapshotService } from './mrr-snapshot.service';
import { PlatformAnalyticsService } from './platform-analytics.service';

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

jest.setTimeout(60_000);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Shared with the other suites that use TEST_DATABASE_URL: one suite at a time. */
const SUITE_LOCK = 727274;

describeDb('platform analytics against PostgreSQL', () => {
  let ds: DataSource;
  let suiteLock: QueryRunner;
  let qr: QueryRunner;
  let service: PlatformAnalyticsService;
  let snapshots: MrrSnapshotService;
  const NOW = new Date();
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  const ahead = (ms: number) => new Date(NOW.getTime() + ms);
  const month = (date: Date) => date.toISOString().slice(0, 7);

  const billingAccess = new BillingAccessService(
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    { get: (_key: string, fallback?: unknown) => fallback } as unknown as ConfigService,
  );

  beforeAll(async () => {
    ds = new DataSource({ type: 'postgres', url, entities: [`${__dirname}/../../**/*.entity.ts`] });
    await ds.initialize();
    suiteLock = ds.createQueryRunner();
    await suiteLock.connect();
    await suiteLock.query('SELECT pg_advisory_lock($1)', [SUITE_LOCK]);
  });

  afterAll(async () => {
    await suiteLock?.query('SELECT pg_advisory_unlock($1)', [SUITE_LOCK]).catch(() => undefined);
    await suiteLock?.release();
    await ds?.destroy();
  });

  beforeEach(async () => {
    qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    await qr.query('UPDATE core.organizations SET is_internal = true');
    await qr.query('DELETE FROM clients.demo_requests');
    await qr.query(`DELETE FROM core.magic_links WHERE type = 'demo_init'`);
    await qr.query('DELETE FROM billing.mrr_snapshots');
    service = new PlatformAnalyticsService(
      qr.manager.getRepository(OrganizationEntity),
      qr.manager.getRepository(PlanEntity),
      billingAccess,
    );
    snapshots = new MrrSnapshotService(qr.manager.getRepository(MrrSnapshotEntity), service);
  });

  afterEach(async () => {
    await qr.rollbackTransaction();
    await qr.release();
  });

  // ── Seed helpers ───────────────────────────────────────────────────────

  async function organization(
    name: string,
    { created = ago(400 * DAY), internal = false, active = true }: { created?: Date; internal?: boolean; active?: boolean } = {},
  ): Promise<string> {
    const id = randomUUID();
    await qr.query(
      `INSERT INTO core.organizations (id, name, slug, is_active, is_internal, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, `${name.toLowerCase().replace(/\W+/g, '-')}-${id.slice(0, 8)}`, active, internal, created],
    );
    return id;
  }

  async function member(orgId: string, email: string, { role = 'owner', lastSeen = null as Date | null } = {}) {
    await qr.query(
      `INSERT INTO core.users (organization_id, email, full_name, role, last_seen_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, email, email.split('@')[0], role, lastSeen, ago(400 * DAY)],
    );
  }

  interface SubscriptionSeed {
    plan: 'free' | 'starter' | 'professional';
    status?: string;
    period?: 'monthly' | 'yearly';
    periodEnd?: Date;
    pastDueSince?: Date | null;
    cancelAtPeriodEnd?: boolean;
    card?: { month: number; year: number } | null;
    demoEndsAt?: Date | null;
  }

  async function subscription(orgId: string, seed: SubscriptionSeed) {
    const paid = seed.plan !== 'free';
    const card = seed.card === undefined ? (paid ? { month: 12, year: 2099 } : null) : seed.card;
    await qr.query(
      `INSERT INTO billing.subscriptions
         (organization_id, plan_id, status, billing_period, current_period_start, current_period_end,
          past_due_since, cancel_at_period_end, payment_method_id, payment_method_exp_month, payment_method_exp_year, demo_ends_at)
       VALUES ($1, (SELECT id FROM billing.plans WHERE name = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        orgId,
        seed.plan,
        seed.status ?? 'active',
        seed.period ?? 'monthly',
        ago(10 * DAY),
        seed.periodEnd ?? ahead(20 * DAY),
        seed.pastDueSince ?? null,
        seed.cancelAtPeriodEnd ?? false,
        card ? `pm_${randomUUID().slice(0, 8)}` : null,
        card?.month ?? null,
        card?.year ?? null,
        seed.demoEndsAt ?? null,
      ],
    );
  }

  async function invoice(orgId: string, cents: number, paidAt: Date | null, status = 'paid') {
    await qr.query(
      `INSERT INTO billing.invoices (organization_id, stripe_invoice_id, amount_due, amount_paid, currency, status, paid_at, created_at)
       VALUES ($1, $2, $3, $4, 'usd', $5, $6, $7)`,
      [orgId, `in_${randomUUID()}`, cents, status === 'paid' ? cents : 0, status, paidAt, paidAt ?? NOW],
    );
  }

  async function usage(orgId: string, counts: { messages?: number; ai_calls?: number }) {
    const start = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), 1));
    const end = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() + 1, 1));
    await qr.query(
      `INSERT INTO billing.usage (organization_id, period_start, period_end, messages, ai_calls, updated_at) VALUES ($1, $2, $3, $4, $5, $6)`,
      [orgId, start, end, counts.messages ?? 0, counts.ai_calls ?? 0, ago(HOUR)],
    );
  }

  async function channel(orgId: string) {
    await qr.query(
      `INSERT INTO integrations.channels (organization_id, type, provider, external_identifier) VALUES ($1, 'whatsapp', 'waha', $2)`,
      [orgId, `waha_${randomUUID().slice(0, 8)}`],
    );
  }

  let demoOrg: string;
  async function demoRequest(seed: {
    first: string;
    last?: string;
    email: string;
    company: string;
    created: Date;
    status: 'processing' | 'ready' | 'failed';
    opens?: number;
    error?: string;
    type?: string;
  }): Promise<string> {
    const companyId = randomUUID();
    const contactId = randomUUID();
    await qr.query(`INSERT INTO clients.companies (id, organization_id, name) VALUES ($1, $2, $3)`, [companyId, demoOrg, seed.company]);
    await qr.query(
      `INSERT INTO clients.contacts (id, organization_id, company_id, first_name, last_name, email) VALUES ($1, $2, $3, $4, $5, $6)`,
      [contactId, demoOrg, companyId, seed.first, seed.last ?? null, seed.email],
    );
    let experience: string | null = null;
    if (seed.status === 'ready') {
      experience = randomUUID();
      await qr.query(
        `INSERT INTO core.magic_links (id, token_hash, type, organization_id, expires_at, uses_count, created_at)
         VALUES ($1, $2, 'demo_experience', $3, $4, $5, $6)`,
        [experience, randomUUID().replace(/-/g, ''), demoOrg, ahead(7 * DAY), seed.opens ?? 0, seed.created],
      );
    }
    const id = randomUUID();
    await qr.query(
      `INSERT INTO clients.demo_requests (id, contact_id, company_id, organization_id, demo_type, status, experience_token_id, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, contactId, companyId, demoOrg, seed.type ?? 'live_chat', seed.status, experience, seed.error ?? null, seed.created],
    );
    return id;
  }

  async function formStarted(created: Date) {
    await qr.query(
      `INSERT INTO core.magic_links (token_hash, type, expires_at, max_uses, created_at) VALUES ($1, 'demo_init', $2, 1, $3)`,
      [randomUUID().replace(/-/g, ''), ahead(HOUR), created],
    );
  }

  /**
   * A small platform:
   *   Acme     paying, Professional monthly ($149), first paid 10 days ago, one open invoice
   *   Beacon   paying, Starter yearly ($490/yr), past due for 10h (grace period), paid 45 days ago
   *   Cedar    Professional, unpaid → payment failed
   *   Delta    Professional, cancelled 5 days ago → churned
   *   Echo     demo ending in 2 days, 92% of messages used, signed up 5 days ago
   *   Fjord    demo ended 3 days ago, signed up 20 days ago
   *   Gale     demo with no end date, signed up 4 days ago, nothing set up
   *   Hollow   deactivated (suspended)
   *   Inside   internal, paying Professional → never counted
   * Leads: Lina (ready, opened, signed up as Echo), Mark (ready, signed up as Acme, paid),
   * Nora (failed), Omar (stuck), Pia (previous period); 6 demo forms started this period.
   */
  async function seedPlatform() {
    demoOrg = await organization('Demo HQ', { internal: true });
    const ids = {
      acme: await organization('Acme Dental'),
      beacon: await organization('Beacon Law'),
      cedar: await organization('Cedar Clinic'),
      delta: await organization('Delta Spa'),
      echo: await organization('Echo Studio', { created: ago(5 * DAY) }),
      fjord: await organization('Fjord Fitness', { created: ago(20 * DAY) }),
      gale: await organization('Gale Realty', { created: ago(4 * DAY) }),
      hollow: await organization('Hollow Motors', { active: false }),
      inside: await organization('Inside Team', { internal: true, created: ago(2 * DAY) }),
    };

    await member(ids.acme, 'mark@acme.test', { lastSeen: ago(2 * HOUR) });
    await member(ids.acme, 'agent@acme.test', { role: 'agent' });
    await member(ids.echo, 'lina@echo.test');
    await member(ids.inside, 'team@inside.test');

    await subscription(ids.acme, { plan: 'professional' });
    await subscription(ids.beacon, { plan: 'starter', period: 'yearly', status: 'past_due', pastDueSince: ago(10 * HOUR) });
    await subscription(ids.cedar, { plan: 'professional', status: 'unpaid' });
    await subscription(ids.delta, { plan: 'professional', status: 'canceled' });
    await subscription(ids.echo, { plan: 'free', demoEndsAt: ahead(2 * DAY + HOUR) });
    await subscription(ids.fjord, { plan: 'free', demoEndsAt: ago(3 * DAY) });
    await subscription(ids.gale, { plan: 'free', demoEndsAt: null });
    await subscription(ids.hollow, { plan: 'professional' });
    await subscription(ids.inside, { plan: 'professional' });

    await invoice(ids.acme, 14900, ago(10 * DAY));
    await invoice(ids.acme, 14900, null, 'open');
    await invoice(ids.beacon, 49000, ago(45 * DAY));
    await invoice(ids.delta, 14900, ago(200 * DAY));
    await invoice(ids.inside, 99999, ago(DAY));
    await qr.query(
      `INSERT INTO billing.stripe_events (stripe_event_id, type, organization_id, processed_at, created_at)
       VALUES ($1, 'customer.subscription.deleted', $2, $3, $3)`,
      [`evt_${randomUUID()}`, ids.delta, ago(5 * DAY)],
    );

    await usage(ids.echo, { messages: 920 });
    await channel(ids.echo);

    const leads = {
      lina: await demoRequest({ first: 'Lina', last: 'Park', email: 'LINA@echo.test', company: 'Echo Studio', created: ago(3 * DAY), status: 'ready', opens: 2 }),
      mark: await demoRequest({ first: 'Mark', email: 'mark@acme.test', company: 'Acme Dental', created: ago(10 * DAY), status: 'ready' }),
      nora: await demoRequest({ first: 'Nora', email: 'nora@north.test', company: 'Northwind', created: ago(DAY), status: 'failed', error: 'Website unreachable', type: 'ai_voice' }),
      omar: await demoRequest({ first: 'Omar', email: 'omar@orbit.test', company: 'Orbit Brightside', created: ago(2 * HOUR), status: 'processing' }),
      pia: await demoRequest({ first: 'Pia', email: 'pia@past.test', company: 'Past Co', created: ago(40 * DAY), status: 'ready' }),
    };
    for (let i = 0; i < 6; i++) await formStarted(ago((i + 1) * DAY));
    await formStarted(ago(50 * DAY));

    return { ...ids, leads };
  }

  // ── Overview ─────────────────────────────────────────────────────────

  it('computes money, growth and the lead funnel for the period, leaving internal organizations out', async () => {
    await seedPlatform();
    const overview = await service.getOverview({ range: '30d' }, NOW);

    expect(overview.money).toEqual({
      mrr: 14900 + 4083,
      mrr_last_month: null,
      arr: (14900 + 4083) * 12,
      paying_organizations: 2,
      average_revenue_per_organization: Math.round((14900 + 4083) / 2),
      cash_collected: 14900,
      cash_collected_previous: 49000,
      outstanding: 14900,
      outstanding_invoices: 1,
      at_risk: {
        amount: 4083 + 14900,
        organizations: 2,
        past_due: 1,
        cancel_scheduled: 0,
        payment_method_issue: 0,
        payment_failed: 1,
      },
      new_paying: 1,
      churned: 1,
    });
    expect(overview.growth).toEqual({
      leads: { total: 4 + 3, previous: 1, demo_requests: 4, signups: 3 },
      demos: { active: 2, ending_7d: 1, no_end_date: 1 },
      conversion: { rate: 50, converted: 1, expired_unpaid: 1 },
    });
    expect(overview.lead_funnel).toEqual([
      { key: 'form_started', count: 6 },
      { key: 'submitted', count: 4 },
      { key: 'ready', count: 2 },
      { key: 'opened', count: 1 },
      { key: 'signed_up', count: 2 },
      { key: 'paid', count: 1 },
    ]);
    expect(overview.signups).toEqual({ signups: 3, activated: 1, paid: 0 });
    expect(overview.period.days).toBe(30);
    expect(overview.currency).toBe('usd');
  });

  it('charts 12 months of collected cash; MRR starts at the first snapshot and is live for this month', async () => {
    const { acme, inside } = await seedPlatform();
    const lastMonth = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 1, 1));
    await qr.query(
      `INSERT INTO billing.mrr_snapshots (period_month, organization_id, plan_name, billing_period, mrr)
       VALUES ($1::date, $2, 'professional', 'monthly', 14900), ($1::date, $3, 'professional', 'monthly', 99999)`,
      [lastMonth.toISOString().slice(0, 10), acme, inside],
    );

    const { revenue_by_month: months, money } = await service.getOverview({ range: '30d' }, NOW);

    expect(months).toHaveLength(12);
    expect(months[11].month).toBe(month(NOW));
    expect(months[10].month).toBe(month(lastMonth));
    const collected = new Map<string, number>();
    for (const [cents, paidAt] of [[14900, ago(10 * DAY)], [49000, ago(45 * DAY)], [14900, ago(200 * DAY)]] as const) {
      collected.set(month(paidAt), (collected.get(month(paidAt)) ?? 0) + cents);
    }
    for (const row of months) expect(row.collected).toBe(collected.get(row.month) ?? 0);
    expect(months[10].mrr).toBe(14900); // the internal organization's snapshot is left out
    expect(months[11].mrr).toBe(money.mrr);
    expect(months.slice(0, 10).every((row) => row.mrr === null)).toBe(true);
    expect(money.mrr_last_month).toBe(14900);
  });

  it('takes a custom period, inclusive of both days', async () => {
    const { acme } = await seedPlatform();
    const paidAt = new Date(Date.UTC(2025, 2, 31, 23, 30));
    await invoice(acme, 5000, paidAt);
    const inside = await service.getOverview({ from: '2025-03-01', to: '2025-03-31' }, NOW);
    expect(inside.money.cash_collected).toBe(5000);
    expect(inside.period).toMatchObject({ from: '2025-03-01T00:00:00.000Z', to: '2025-04-01T00:00:00.000Z', days: 31 });
    const outside = await service.getOverview({ from: '2025-03-01', to: '2025-03-30' }, NOW);
    expect(outside.money.cash_collected).toBe(0);
    expect(outside.money.cash_collected_previous).toBe(0);
  });

  it('stops counting an organization as soon as it is marked internal', async () => {
    const { acme } = await seedPlatform();
    await qr.query('UPDATE core.organizations SET is_internal = true WHERE id = $1', [acme]);
    const overview = await service.getOverview({ range: '30d' }, NOW);
    expect(overview.money.mrr).toBe(4083);
    expect(overview.money.cash_collected).toBe(0);
    expect(overview.lead_funnel.find((step) => step.key === 'signed_up')?.count).toBe(1);
  });

  // ── Attention ────────────────────────────────────────────────────────

  it('lists what needs action: critical first, most money first', async () => {
    await seedPlatform();
    const { items, counts } = await service.getAttention(NOW);
    const summary = items.map((item: PlatformAttentionItem) => [item.kind, item.target.name, item.reason]);

    expect(summary).toEqual([
      ['payment_failed', 'Cedar Clinic', 'Blocked: unpaid'],
      ['grace_ending', 'Beacon Law', 'Grace ends in 1 day'],
      ['demo_request_failed', 'Nora', 'Demo generation failed'],
      ['demo_request_stuck', 'Omar', 'Stuck for 2h'],
      ['not_activated', 'Gale Realty', 'No channel after 4 days'],
      ['hot_demo', 'Echo Studio', 'Demo ends in 2 days'],
    ]);
    expect(counts).toEqual({ critical: 4, warning: 2 });
    expect(items[2]).toMatchObject({
      target: { type: 'lead', email: 'nora@north.test', company: 'Northwind' },
      detail: 'AI voice demo · Northwind · Website unreachable',
    });
    expect(items[5].detail).toBe('92% of messages used · Demo · lina@echo.test');
  });

  // ── Leads ────────────────────────────────────────────────────────────

  it('lists demo requests and signups newest first, linking demo leads to the account they opened', async () => {
    const { leads, echo, acme } = await seedPlatform();
    const page = await service.listLeads({ page: 1, limit: 5 }, NOW);

    expect(page.meta).toMatchObject({ total: 5 + 8, page: 1, limit: 5, total_pages: 3, has_next: true });
    expect(page.items.map((lead) => [lead.source, lead.name])).toEqual([
      ['demo_request', 'Omar'],
      ['demo_request', 'Nora'],
      ['demo_request', 'Lina Park'],
      ['signup', 'Gale Realty'],
      ['signup', 'Echo Studio'],
    ]);
    const lina = page.items.find((lead) => lead.id === leads.lina);
    expect(lina).toMatchObject({
      email: 'LINA@echo.test',
      company: 'Echo Studio',
      demo_type: 'live_chat',
      demo_status: 'ready',
      demo_opens: 2,
      organization: { id: echo, name: 'Echo Studio', state: 'demo' },
    });
    expect(page.items.find((lead) => lead.name === 'Gale Realty')).toMatchObject({ demo_opens: null, company: null, organization: { state: 'demo' } });

    const all = await service.listLeads({ source: 'demo_request', limit: 100 }, NOW);
    expect(all.items.find((lead) => lead.id === leads.mark)?.organization).toEqual({ id: acme, name: 'Acme Dental', state: 'paying' });
  });

  it('filters leads by source and searches names, emails and companies', async () => {
    await seedPlatform();
    expect((await service.listLeads({ source: 'signup' }, NOW)).meta.total).toBe(8);
    expect((await service.listLeads({ source: 'demo_request' }, NOW)).meta.total).toBe(5);
    const brightside = await service.listLeads({ search: 'brightside' }, NOW);
    expect(brightside.items.map((lead) => lead.name)).toEqual(['Omar']);
    expect((await service.listLeads({ search: 'ACME.test' }, NOW)).items.map((l) => l.name).sort()).toEqual(['Acme Dental', 'Mark']);
    expect((await service.listLeads({ search: '100%_' }, NOW)).meta.total).toBe(0);
  });

  // ── Organizations ────────────────────────────────────────────────────

  it('lists organizations with state, MRR, usage and activity, sorted by MRR', async () => {
    const { acme } = await seedPlatform();
    const page = await service.listOrganizations({}, NOW);

    // MRR, then lifetime revenue (Acme has paid, Cedar never did; Delta paid before churning), then newest.
    expect(page.items.map((org) => [org.name, org.state, org.mrr])).toEqual([
      ['Acme Dental', 'paying', 14900],
      ['Cedar Clinic', 'payment_failed', 14900],
      ['Beacon Law', 'paying', 4083],
      ['Delta Spa', 'churned', 0],
      ['Gale Realty', 'demo', 0],
      ['Echo Studio', 'demo', 0],
      ['Fjord Fitness', 'demo_expired', 0],
      ['Hollow Motors', 'suspended', 0],
    ]);
    expect(page.counts).toMatchObject({
      all: 8, paying: 2, payment_failed: 1, churned: 1, demo: 2, demo_expired: 1, suspended: 1, ending_soon: 1,
    });
    expect(page.counts.internal).toBeGreaterThanOrEqual(2);

    const acmeRow = page.items.find((org) => org.id === acme)!;
    expect(acmeRow).toMatchObject({
      owner_email: 'mark@acme.test',
      plan_name: 'professional',
      members: 2,
      lifetime_revenue: 14900,
      is_internal: false,
      demo_ends_at: null,
    });
    expect(new Date(acmeRow.last_activity_at!).getTime()).toBe(ago(2 * HOUR).getTime());
    expect(acmeRow.renews_at).not.toBeNull();

    const echo = page.items.find((org) => org.name === 'Echo Studio')!;
    expect(echo.usage_peak).toEqual({ metric: 'messages', used: 920, limit: 1000, percent: 92 });
    expect(echo.channels).toBe(1);
  });

  it('filters, searches, sorts and pages organizations', async () => {
    await seedPlatform();
    expect((await service.listOrganizations({ filter: 'ending_soon' }, NOW)).items.map((o) => o.name)).toEqual(['Echo Studio']);
    const internal = await service.listOrganizations({ filter: 'internal', search: 'inside' }, NOW);
    expect(internal.items).toEqual([expect.objectContaining({ name: 'Inside Team', is_internal: true, state: 'paying' })]);
    expect((await service.listOrganizations({ search: 'MARK@acme' }, NOW)).items.map((o) => o.name)).toEqual(['Acme Dental']);
    expect((await service.listOrganizations({ sort: 'demo_end', filter: 'demo' }, NOW)).items.map((o) => o.name)).toEqual([
      'Echo Studio',
      'Gale Realty',
    ]);
    expect((await service.listOrganizations({ sort: 'activity', limit: 2 }, NOW)).items.map((o) => o.name)).toEqual([
      'Echo Studio',
      'Acme Dental',
    ]);
    const second = await service.listOrganizations({ sort: 'created', page: 2, limit: 3 }, NOW);
    expect(second.meta).toMatchObject({ total: 8, page: 2, total_pages: 3, has_prev: true, has_next: true });
    expect(second.items).toHaveLength(3);
  });

  // ── MRR snapshots ────────────────────────────────────────────────────

  it('snapshots every paying organization for the current month, replacing the previous capture', async () => {
    const { acme, beacon, inside } = await seedPlatform();
    expect(await snapshots.capture(NOW)).toBe(3);

    await qr.query(`UPDATE billing.subscriptions SET status = 'canceled' WHERE organization_id = $1`, [beacon]);
    expect(await snapshots.capture(NOW)).toBe(2);

    const rows = (await qr.query(
      `SELECT organization_id, mrr, plan_name, billing_period, to_char(period_month, 'YYYY-MM') AS month FROM billing.mrr_snapshots`,
    )) as Array<{ organization_id: string; mrr: number; plan_name: string; month: string }>;
    expect(rows.map((row) => [row.organization_id, row.mrr, row.month]).sort()).toEqual(
      [
        [acme, 14900, month(NOW)],
        [inside, 14900, month(NOW)],
      ].sort(),
    );
  });
});

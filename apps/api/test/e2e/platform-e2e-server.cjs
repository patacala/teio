/**
 * Real platform (super admin) API for the web end-to-end test: the compiled
 * platform analytics and organizations controllers, services, billing access
 * policy, validation, guards and PostgreSQL. Only login is stubbed: any bearer
 * token is a platform admin, unless `x-e2e-role` names an organization role.
 *
 * Platform figures span every organization, so this server needs an EMPTY
 * database (scripts/e2e-platform.sh builds a throwaway one):
 *
 *   pnpm --filter @crm/api build
 *   DATABASE_URL=postgres://.../empty_db E2E_STATE_FILE=/tmp/e2e-platform.json node test/e2e/platform-e2e-server.cjs
 *   E2E_API_URL=<printed url> E2E_STATE_FILE=/tmp/e2e-platform.json pnpm --filter @crm/web test platform.e2e
 */
require('reflect-metadata');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, VersioningType } = require('@nestjs/common');
const { APP_GUARD } = require('@nestjs/core');
const { ConfigModule } = require('@nestjs/config');
const { TypeOrmModule } = require('@nestjs/typeorm');
const { DataSource } = require('typeorm');

const dist = (file) => require(path.join(__dirname, '../../dist', file));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const { PlatformAnalyticsController } = dist('modules/platform-analytics/platform-analytics.controller');
  const { PlatformAnalyticsService } = dist('modules/platform-analytics/platform-analytics.service');
  const { MrrSnapshotService } = dist('modules/platform-analytics/mrr-snapshot.service');
  const { MrrSnapshotEntity } = dist('modules/platform-analytics/entities/mrr-snapshot.entity');
  const { OrganizationsController } = dist('modules/organizations/organizations.controller');
  const { OrganizationsService } = dist('modules/organizations/organizations.service');
  const { OrganizationEntity } = dist('modules/organizations/organization.entity');
  const { UserEntity } = dist('modules/users/user.entity');
  const { PlanEntity } = dist('modules/billing/entities/plan.entity');
  const { SubscriptionEntity } = dist('modules/billing/entities/subscription.entity');
  const { BillingAccessService } = dist('modules/billing/billing-access.service');
  const { UsageTrackingService } = dist('modules/billing/usage-tracking.service');
  const { JwtAuthGuard } = dist('common/guards/jwt-auth.guard');
  const { RolesGuard } = dist('common/guards/roles.guard');
  const { PlatformAdminGuard } = dist('common/guards/platform-admin.guard');
  const { GlobalExceptionFilter } = dist('common/filters/global-exception.filter');
  const { TransformInterceptor } = dist('common/interceptors/transform.interceptor');

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ billing: { gracePeriodHours: 48 } })] }),
      TypeOrmModule.forRoot({ type: 'postgres', url, entities: [path.join(__dirname, '../../dist/**/*.entity.js')] }),
      TypeOrmModule.forFeature([OrganizationEntity, UserEntity, PlanEntity, SubscriptionEntity, MrrSnapshotEntity]),
    ],
    controllers: [PlatformAnalyticsController, OrganizationsController],
    providers: [
      PlatformAnalyticsService,
      MrrSnapshotService,
      OrganizationsService,
      BillingAccessService,
      // Only used for per-organization limit checks, which these routes never make.
      { provide: UsageTrackingService, useValue: {} },
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
      { provide: APP_GUARD, useClass: PlatformAdminGuard },
    ],
  }).compile();

  const ds = moduleRef.get(DataSource);
  const [{ count }] = await ds.query('SELECT COUNT(*)::int AS count FROM core.organizations');
  if (count > 0) {
    throw new Error(
      `The platform e2e needs an empty database (found ${count} organizations): platform figures span every organization. ` +
        'Use scripts/e2e-platform.sh, which builds a throwaway one.',
    );
  }

  // ── Seed a small platform (same shape as platform-analytics.integration.spec) ──
  const now = Date.now();
  const ago = (ms) => new Date(now - ms);
  const ahead = (ms) => new Date(now + ms);
  const q = (sql, params) => ds.query(sql, params);

  async function organization(name, { created = ago(400 * DAY), internal = false, active = true } = {}) {
    const id = randomUUID();
    const slug = name.toLowerCase().replace(/\W+/g, '-');
    await q('INSERT INTO core.organizations (id, name, slug, is_active, is_internal, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      id, name, slug, active, internal, created,
    ]);
    return id;
  }
  const member = (orgId, email, { role = 'owner', lastSeen = null, platform = false } = {}) =>
    q('INSERT INTO core.users (organization_id, email, full_name, role, last_seen_at, is_platform_admin, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      orgId, email, email.split('@')[0], role, lastSeen, platform, ago(400 * DAY),
    ]);
  async function subscription(orgId, plan, s = {}) {
    const paid = plan !== 'free';
    const card = s.card === undefined ? (paid ? { month: 12, year: 2099 } : null) : s.card;
    await q(
      `INSERT INTO billing.subscriptions
         (organization_id, plan_id, status, billing_period, current_period_start, current_period_end,
          past_due_since, cancel_at_period_end, payment_method_id, payment_method_exp_month, payment_method_exp_year, demo_ends_at)
       VALUES ($1, (SELECT id FROM billing.plans WHERE name = $2), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        orgId, plan, s.status || 'active', s.period || 'monthly', ago(10 * DAY), s.periodEnd || ahead(20 * DAY),
        s.pastDueSince || null, !!s.cancel, card ? 'pm_e2e' : null, card ? card.month : null, card ? card.year : null, s.demoEndsAt || null,
      ],
    );
  }
  const invoice = (orgId, cents, paidAt, status = 'paid') =>
    q(
      `INSERT INTO billing.invoices (organization_id, stripe_invoice_id, amount_due, amount_paid, currency, status, paid_at, created_at)
       VALUES ($1, $2, $3, $4, 'usd', $5, $6, $7)`,
      [orgId, `in_${randomUUID()}`, cents, status === 'paid' ? cents : 0, status, paidAt, paidAt || new Date(now)],
    );

  const hq = await organization('Platform HQ', { internal: true });
  await member(hq, 'pat@platform.test', { role: 'admin', platform: true });
  const demoOrg = await organization('Demo HQ', { internal: true });

  const acme = await organization('Acme Dental');
  const beacon = await organization('Beacon Law');
  const cedar = await organization('Cedar Clinic');
  const delta = await organization('Delta Spa');
  const echo = await organization('Echo Studio', { created: ago(5 * DAY) });
  const fjord = await organization('Fjord Fitness', { created: ago(20 * DAY) });
  const gale = await organization('Gale Realty', { created: ago(4 * DAY) });
  await organization('Hollow Motors', { active: false });

  await member(acme, 'mark@acme.test', { lastSeen: ago(2 * HOUR) });
  await member(cedar, 'owner@cedar.test');
  await member(echo, 'lina@echo.test');
  await member(gale, 'hi@gale.test');

  await subscription(acme, 'professional');
  await subscription(beacon, 'starter', { period: 'yearly', status: 'past_due', pastDueSince: ago(10 * HOUR) });
  await subscription(cedar, 'professional', { status: 'unpaid' });
  await subscription(delta, 'professional', { status: 'canceled' });
  await subscription(echo, 'free', { demoEndsAt: ahead(2 * DAY + HOUR) });
  await subscription(fjord, 'free', { demoEndsAt: ago(3 * DAY) });
  await subscription(gale, 'free');

  await invoice(acme, 14900, ago(10 * DAY));
  await invoice(acme, 14900, null, 'open');
  await invoice(beacon, 49000, ago(45 * DAY));
  await invoice(delta, 14900, ago(200 * DAY));
  await q(
    `INSERT INTO billing.stripe_events (stripe_event_id, type, organization_id, processed_at, created_at)
     VALUES ('evt_e2e_deleted', 'customer.subscription.deleted', $1, $2, $2)`,
    [delta, ago(5 * DAY)],
  );
  const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
  await q(
    'INSERT INTO billing.usage (organization_id, period_start, period_end, messages, updated_at) VALUES ($1, $2, $3, 920, $4)',
    [echo, monthStart, nextMonth, ago(HOUR)],
  );
  await q(`INSERT INTO integrations.channels (organization_id, type, provider, external_identifier) VALUES ($1, 'whatsapp', 'waha', 'waha_e2e')`, [echo]);

  async function demoRequest({ first, last = null, email, company, created, status, opens = 0, error = null, type = 'live_chat' }) {
    const companyId = randomUUID();
    const contactId = randomUUID();
    await q('INSERT INTO clients.companies (id, organization_id, name) VALUES ($1, $2, $3)', [companyId, demoOrg, company]);
    await q('INSERT INTO clients.contacts (id, organization_id, company_id, first_name, last_name, email) VALUES ($1, $2, $3, $4, $5, $6)', [
      contactId, demoOrg, companyId, first, last, email,
    ]);
    let experience = null;
    if (status === 'ready') {
      experience = randomUUID();
      await q(
        `INSERT INTO core.magic_links (id, token_hash, type, organization_id, expires_at, uses_count, created_at)
         VALUES ($1, $2, 'demo_experience', $3, $4, $5, $6)`,
        [experience, randomUUID().replace(/-/g, ''), demoOrg, ahead(7 * DAY), opens, created],
      );
    }
    await q(
      `INSERT INTO clients.demo_requests (contact_id, company_id, organization_id, demo_type, status, experience_token_id, error_message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [contactId, companyId, demoOrg, type, status, experience, error, created],
    );
  }
  await demoRequest({ first: 'Lina', last: 'Park', email: 'lina@echo.test', company: 'Echo Studio', created: ago(3 * DAY), status: 'ready', opens: 2 });
  await demoRequest({ first: 'Mark', email: 'mark@acme.test', company: 'Acme Dental', created: ago(10 * DAY), status: 'ready' });
  await demoRequest({ first: 'Nora', email: 'nora@north.test', company: 'Northwind', created: ago(DAY), status: 'failed', error: 'Website unreachable', type: 'ai_voice' });
  await demoRequest({ first: 'Omar', email: 'omar@orbit.test', company: 'Orbit', created: ago(2 * HOUR), status: 'processing' });
  for (let i = 1; i <= 6; i++) {
    await q(`INSERT INTO core.magic_links (token_hash, type, expires_at, max_uses, created_at) VALUES ($1, 'demo_init', $2, 1, $3)`, [
      randomUUID().replace(/-/g, ''), ahead(HOUR), ago(i * DAY),
    ]);
  }
  // Last month's MRR (only Acme paid then), so "vs last month" has something to compare with.
  const lastMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1));
  await q(
    `INSERT INTO billing.mrr_snapshots (period_month, organization_id, plan_name, billing_period, mrr) VALUES ($1::date, $2, 'professional', 'monthly', 14900)`,
    [lastMonth.toISOString().slice(0, 10), acme],
  );
  // And this month's, exactly as the hourly job would take it.
  const captured = await moduleRef.get(MrrSnapshotService).capture(new Date(now));

  // ── HTTP app ─────────────────────────────────────────────────────────────
  const app = moduleRef.createNestApplication();
  app.use((req, _res, next) => {
    if (req.headers.authorization) {
      const role = req.headers['x-e2e-role'];
      const platform = !role;
      req.user = { id: 'e2e-user', auth_user_id: 'e2e', email: null, organization_id: hq, role: role || 'admin', is_platform_admin: platform };
      req.tenant = { organization_id: hq, user_id: null, role: role || 'admin' };
    }
    next();
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  await app.listen(Number(process.env.E2E_PORT || 0), '127.0.0.1');

  const state = {
    apiUrl: `http://127.0.0.1:${app.getHttpServer().address().port}`,
    organizations: { acme, beacon, cedar, echo, gale },
    snapshotted: captured,
  };
  if (process.env.E2E_STATE_FILE) fs.writeFileSync(process.env.E2E_STATE_FILE, JSON.stringify(state));
  console.log(JSON.stringify(state));

  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

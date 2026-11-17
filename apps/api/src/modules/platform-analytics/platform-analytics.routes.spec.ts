/// <reference types="jest" />
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { BillingAccessLevel, BillingRestrictionReason } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { BillingAccessGuard } from '../billing/billing-access.guard';
import { BillingAccessService } from '../billing/billing-access.service';
import { OrganizationsController } from '../organizations/organizations.controller';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlatformAnalyticsController } from './platform-analytics.controller';
import { PlatformAnalyticsService } from './platform-analytics.service';

const ORG = '11111111-1111-4111-8111-111111111111';

type Who = 'owner' | 'admin' | 'agent' | 'api_key' | 'platform' | 'anonymous';

/** The caller's own organization is blocked: platform routes must not care. */
const BLOCKED: BillingAccess = {
  level: BillingAccessLevel.BLOCKED, is_demo: false, status: 'unpaid', reasons: [BillingRestrictionReason.SUBSCRIPTION_UNPAID],
  requires_action: true, is_paid_plan: true, has_valid_payment_method: false, grace_period_ends_at: null, plan_name: 'pro',
  effective_plan_name: 'none', effective_limits: { conversations: 0, messages: 0, ai_calls: 0, agents: 0, voice_minutes: 0 },
  effective_features: [], has_custom_limits: false, demo_ends_at: null,
};

describe('Platform analytics routes (HTTP, real guards and pipes)', () => {
  let app: INestApplication;
  let baseUrl: string;
  const analytics = {
    getOverview: jest.fn(async () => ({ money: { mrr: 100 } })),
    getAttention: jest.fn(async () => ({ items: [], counts: { critical: 0, warning: 0 } })),
    listLeads: jest.fn(async () => ({ items: [], meta: {} })),
    listOrganizations: jest.fn(async () => ({ items: [], meta: {}, counts: {} })),
  };
  const organizations = {
    update: jest.fn(async (id: string, dto: object) => ({ id, ...dto })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PlatformAnalyticsController, OrganizationsController],
      providers: [
        { provide: PlatformAnalyticsService, useValue: analytics },
        { provide: OrganizationsService, useValue: organizations },
        { provide: BillingAccessService, useValue: { getAccess: async () => BLOCKED } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PlatformAdminGuard },
        { provide: APP_GUARD, useClass: BillingAccessGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const who = req.headers['x-test-user'] as Who | undefined;
      if (who && who !== 'anonymous') {
        const role = who === 'platform' ? 'admin' : who;
        req.user = { id: 'u1', auth_user_id: 'a1', email: null, organization_id: ORG, role, is_platform_admin: who === 'platform' };
        req.tenant = { organization_id: ORG, user_id: 'u1', role };
      }
      next();
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0);
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  });

  afterAll(async () => app?.close());
  beforeEach(() => jest.clearAllMocks());

  async function call(who: Who, method: string, path: string, body?: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': who },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const ROUTES = ['/platform/analytics/overview', '/platform/analytics/attention', '/platform/analytics/leads', '/platform/analytics/organizations'];

  it.each(ROUTES)('GET %s is for platform admins only, whatever their organization role', async (path) => {
    for (const who of ['owner', 'admin', 'agent', 'api_key'] as const) {
      expect((await call(who, 'GET', path)).status).toBe(403);
    }
    expect((await call('anonymous', 'GET', path)).status).toBe(401);
    const ok = await call('platform', 'GET', path);
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveProperty('data');
  });

  it('answers even when the platform admin’s own organization is blocked by billing', async () => {
    const res = await call('platform', 'GET', '/platform/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ money: { mrr: 100 } });
  });

  it('passes the overview period through and rejects invalid ones', async () => {
    await call('platform', 'GET', '/platform/analytics/overview?range=7d');
    expect(analytics.getOverview).toHaveBeenLastCalledWith(expect.objectContaining({ range: '7d' }));
    await call('platform', 'GET', '/platform/analytics/overview?from=2026-05-01&to=2026-05-31');
    expect(analytics.getOverview).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-05-01', to: '2026-05-31' }));

    for (const qs of ['range=1y', 'from=May%201', 'to=2026-5-1', 'unknown=1']) {
      expect((await call('platform', 'GET', `/platform/analytics/overview?${qs}`)).status).toBe(400);
    }
    expect(analytics.getOverview).toHaveBeenCalledTimes(2);
  });

  it('validates lead and organization list queries', async () => {
    await call('platform', 'GET', '/platform/analytics/leads?source=signup&search=acme&page=2&limit=50');
    expect(analytics.listLeads).toHaveBeenCalledWith(expect.objectContaining({ source: 'signup', search: 'acme', page: 2, limit: 50 }));
    await call('platform', 'GET', '/platform/analytics/organizations?filter=ending_soon&sort=demo_end');
    expect(analytics.listOrganizations).toHaveBeenCalledWith(expect.objectContaining({ filter: 'ending_soon', sort: 'demo_end' }));

    for (const path of [
      '/platform/analytics/leads?source=partner',
      '/platform/analytics/leads?limit=101',
      '/platform/analytics/leads?page=0',
      '/platform/analytics/organizations?filter=vip',
      '/platform/analytics/organizations?sort=name',
      `/platform/analytics/organizations?search=${'x'.repeat(101)}`,
    ]) {
      expect((await call('platform', 'GET', path)).status).toBe(400);
    }
  });

  it('PATCH /organizations/:id marks an organization internal (platform admins only, strict boolean)', async () => {
    expect((await call('owner', 'PATCH', `/organizations/${ORG}`, { is_internal: true })).status).toBe(403);
    expect((await call('platform', 'PATCH', `/organizations/${ORG}`, { is_internal: 'true' })).status).toBe(400);
    expect(organizations.update).not.toHaveBeenCalled();

    const ok = await call('platform', 'PATCH', `/organizations/${ORG}`, { is_internal: true });
    expect(ok.status).toBe(200);
    expect(organizations.update).toHaveBeenCalledWith(ORG, { is_internal: true });
  });
});

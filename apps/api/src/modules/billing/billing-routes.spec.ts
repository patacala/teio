/// <reference types="jest" />
import { Controller, Get, INestApplication, Post, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import { BillingAccessLevel, BillingRestrictionReason, PlanFeature } from '@crm/shared';
import type { BillingAccess } from '@crm/shared';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { BillingController } from './billing.controller';
import { BillingAccessGuard } from './billing-access.guard';
import { RequiresPlanFeature } from './billing-access.decorators';
import { BillingAccessService } from './billing-access.service';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { OrganizationsController } from '../organizations/organizations.controller';
import { OrganizationsService } from '../organizations/organizations.service';
import { PaymentSettingsController } from '../payments/payment-settings.controller';
import { PaymentSettingsService } from '../payments/payment-settings.service';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import { PlatformBillingController } from './platform-billing.controller';
import { DemoLimitsService } from './demo-limits.service';
import { ConversationManagementController } from '../conversation-management/conversation-management.controller';
import { ConversationManagementService } from '../conversation-management/conversation-management.service';
import type { LimitCheck } from './billing-access.service';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const PLAN = '33333333-3333-4333-8333-333333333333';

@Controller({ path: 'crm-feature', version: '1' })
class ProductController {
  @Get()
  list() {
    return { ok: true };
  }

  @Post('calls')
  @RequiresPlanFeature(PlanFeature.VOICE_CALLS)
  call() {
    return { ok: true };
  }
}

type Who = 'owner' | 'admin' | 'agent' | 'viewer' | 'api_key' | 'platform' | 'anonymous';

function access(overrides: Partial<BillingAccess> = {}): BillingAccess {
  const limits = { conversations: 100, messages: 1000, ai_calls: 10, agents: 2, voice_minutes: 0 };
  return {
    level: BillingAccessLevel.FULL, is_demo: true, status: 'active', reasons: [], requires_action: false,
    is_paid_plan: false, has_valid_payment_method: false, grace_period_ends_at: null, plan_name: 'free',
    effective_plan_name: 'free', effective_limits: limits, effective_features: ['all'], has_custom_limits: false, demo_ends_at: null,
    ...overrides,
  };
}

const BLOCKED = access({
  level: BillingAccessLevel.BLOCKED, is_demo: false, status: 'unpaid', is_paid_plan: true,
  reasons: [BillingRestrictionReason.SUBSCRIPTION_UNPAID], requires_action: true,
  effective_plan_name: 'none', effective_features: [],
});

describe('Route behavior (HTTP, real guards and pipes)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let currentAccess: BillingAccess;
  let limitCheck: LimitCheck | null;
  const config: Record<string, string> = {};
  const subscription = {
    getPlans: jest.fn(async () => []),
    getAccess: jest.fn(async () => currentAccess),
    getOverview: jest.fn(async () => ({ usage: { messages: 1 } })),
    listInvoices: jest.fn(async () => ({ items: [], meta: {} })),
    createStripeCustomer: jest.fn(async () => ({ stripe_customer_id: 'cus_1' })),
    startCheckout: jest.fn(async () => ({ url: 'https://checkout.stripe.test' })),
    changePlan: jest.fn(async () => ({})),
    createPaymentMethodSession: jest.fn(async () => ({ url: 'https://setup.stripe.test' })),
    createPortalSession: jest.fn(async () => ({ url: 'https://portal.stripe.test' })),
    cancelSubscription: jest.fn(async () => ({})),
    resumeSubscription: jest.fn(async () => ({})),
    handleStripeEvent: jest.fn(async () => undefined),
  };
  const stripe = {
    isConfigured: jest.fn(() => true),
    constructWebhookEvent: jest.fn((_body: Buffer, sig: string) => {
      if (sig !== 'valid') throw new Error('bad signature');
      return { id: 'evt_1', type: 'invoice.paid' };
    }),
  };
  const organizations = {
    findAll: jest.fn(async () => []),
    findById: jest.fn(async (id: string) => ({ id, settings: {} })),
    create: jest.fn(async (dto: unknown) => dto),
    update: jest.fn(async (id: string, dto: object) => ({ id, ...dto })),
  };
  const paymentSettings = { getMasked: jest.fn(async () => ({})), update: jest.fn(async () => ({})) };
  const users = {
    findById: jest.fn(async () => ({ id: 'u1' })),
    findByIdUnscoped: jest.fn(),
    invite: jest.fn(async () => ({})),
    create: jest.fn(async () => ({})),
  };
  const demoLimits = {
    getDefaults: jest.fn(async () => ({ limits: {} })),
    updateDefaults: jest.fn(async () => ({ limits: {} })),
    listOrganizations: jest.fn(async () => ({ items: [], meta: {} })),
    setOverrides: jest.fn(async () => undefined),
    setDemoPeriod: jest.fn(async () => undefined),
    clearOverrides: jest.fn(async () => undefined),
  };
  const conversations = {
    create: jest.fn(async () => ({ id: 'conv-1' })),
    sendMessage: jest.fn(async () => ({ id: 'msg-1' })),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        BillingController, OrganizationsController, PaymentSettingsController, UsersController, ProductController,
        PlatformBillingController, ConversationManagementController,
      ],
      providers: [
        { provide: SubscriptionService, useValue: subscription },
        { provide: StripeService, useValue: stripe },
        { provide: ConfigService, useValue: { get: (k: string, d?: unknown) => config[k] ?? d } },
        { provide: OrganizationsService, useValue: organizations },
        { provide: PaymentSettingsService, useValue: paymentSettings },
        { provide: UsersService, useValue: users },
        {
          provide: BillingAccessService,
          useValue: {
            getAccess: async () => currentAccess,
            checkLimit: async (_org: string, metric: string) => limitCheck ?? { allowed: true, metric, limit: -1, current: 0 },
          },
        },
        { provide: DemoLimitsService, useValue: demoLimits },
        { provide: ConversationManagementService, useValue: conversations },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PlatformAdminGuard },
        { provide: APP_GUARD, useClass: BillingAccessGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
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

  beforeEach(() => {
    jest.clearAllMocks();
    currentAccess = access();
    limitCheck = null;
    config.STRIPE_WEBHOOK_SECRET = 'whsec_test';
    stripe.isConfigured.mockReturnValue(true);
  });

  async function call(who: Who, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-test-user': who, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  describe('billing routes', () => {
    it('POST /billing/subscribe was removed (use /billing/checkout)', async () => {
      expect((await call('owner', 'POST', '/billing/subscribe', {})).status).toBe(404);
    });

    it('GET /billing/plans is public', async () => {
      expect((await call('anonymous', 'GET', '/billing/plans')).status).toBe(200);
    });

    it('GET /billing/status is readable by any member but requires a session', async () => {
      for (const who of ['owner', 'admin', 'agent', 'viewer'] as const) {
        expect((await call(who, 'GET', '/billing/status')).status).toBe(200);
      }
      expect((await call('anonymous', 'GET', '/billing/status')).status).toBe(401);
    });

    it.each([
      ['GET', '/billing/subscription', undefined],
      ['GET', '/billing/usage', undefined],
      ['GET', '/billing/invoices', undefined],
      ['POST', '/billing/customer', {}],
      ['POST', '/billing/checkout', { plan_id: PLAN, period: 'monthly' }],
      ['POST', '/billing/change-plan', { plan_id: PLAN, period: 'yearly' }],
      ['POST', '/billing/payment-method', {}],
      ['POST', '/billing/portal', {}],
      ['POST', '/billing/cancel', {}],
      ['POST', '/billing/resume', {}],
    ])('%s %s is only for owners and admins', async (method, path, body) => {
      for (const who of ['owner', 'admin'] as const) {
        expect((await call(who, method, path, body)).status).toBe(200);
      }
      for (const who of ['agent', 'viewer', 'api_key'] as const) {
        expect((await call(who, method, path, body)).status).toBe(403);
      }
    });

    it('POST /billing/portal ignores a client-supplied return URL', async () => {
      const res = await call('owner', 'POST', '/billing/portal', { returnUrl: 'https://evil.test' });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ url: 'https://portal.stripe.test' });
      expect(subscription.createPortalSession).toHaveBeenCalledWith(ORG);
    });

    it('POST /billing/checkout validates the payload and never accepts an organization id', async () => {
      const bad = await call('owner', 'POST', '/billing/checkout', { plan_id: 'x', period: 'weekly' });
      expect(bad.status).toBe(400);
      expect(bad.body.message).toEqual(expect.arrayContaining(['plan_id must be a UUID']));

      const smuggled = await call('owner', 'POST', '/billing/checkout', { plan_id: PLAN, period: 'monthly', organization_id: OTHER_ORG });
      expect(smuggled.status).toBe(400);
      expect(smuggled.body.message).toEqual(['property organization_id should not exist']);
      expect(subscription.startCheckout).not.toHaveBeenCalled();

      await call('owner', 'POST', '/billing/checkout', { plan_id: PLAN, period: 'monthly' });
      expect(subscription.startCheckout).toHaveBeenCalledWith(ORG, { plan_id: PLAN, period: 'monthly' });
    });

    it('GET /billing/invoices bounds pagination', async () => {
      expect((await call('owner', 'GET', '/billing/invoices?limit=500')).status).toBe(400);
      await call('owner', 'GET', '/billing/invoices?page=2&limit=5');
      expect(subscription.listInvoices).toHaveBeenCalledWith(ORG, 2, 5);
    });
  });

  describe('Stripe webhook', () => {
    const hook = (sig?: string) =>
      call('anonymous', 'POST', '/billing/webhooks/stripe', { id: 'evt_1' }, sig ? { 'stripe-signature': sig } : {});

    it('rejects requests without a signature (401)', async () => {
      expect((await hook()).status).toBe(401);
    });

    it('rejects an invalid signature (400)', async () => {
      expect((await hook('forged')).status).toBe(400);
      expect(subscription.handleStripeEvent).not.toHaveBeenCalled();
    });

    it('returns 503 instead of silently dropping events when the secret is not configured', async () => {
      config.STRIPE_WEBHOOK_SECRET = '';
      expect((await hook('valid')).status).toBe(503);
      expect(subscription.handleStripeEvent).not.toHaveBeenCalled();
    });

    it('returns 503 when Stripe itself is not configured', async () => {
      stripe.isConfigured.mockReturnValue(false);
      expect((await hook('valid')).status).toBe(503);
    });

    it('processes a correctly signed event', async () => {
      expect((await hook('valid')).status).toBe(200);
      expect(subscription.handleStripeEvent).toHaveBeenCalledWith({ id: 'evt_1', type: 'invoice.paid' });
    });

    it('keeps working while the organization is blocked', async () => {
      currentAccess = BLOCKED;
      expect((await hook('valid')).status).toBe(200);
    });
  });

  describe('organization admin routes', () => {
    it('POST /organizations is platform-admin only and validates the payload', async () => {
      expect((await call('owner', 'POST', '/organizations', { name: 'X', slug: 'x' })).status).toBe(403);
      expect((await call('platform', 'POST', '/organizations', { name: 'X', slug: 'Bad Slug' })).status).toBe(400);
      expect((await call('platform', 'POST', '/organizations', { name: 'X', slug: 'x', plan: 'enterprise' })).status).toBe(400);
      expect((await call('platform', 'POST', '/organizations', { name: 'X', slug: 'x-1' })).status).toBe(201);
    });

    it('PATCH /organizations/:id is platform-admin only, even for the org owner', async () => {
      expect((await call('owner', 'PATCH', `/organizations/${ORG}`, { is_active: false })).status).toBe(403);
      expect((await call('admin', 'PATCH', `/organizations/${OTHER_ORG}`, { is_active: false })).status).toBe(403);
      expect(organizations.update).not.toHaveBeenCalled();
    });

    it('PATCH /organizations/:id rejects fields outside the DTO and non-UUID ids', async () => {
      expect((await call('platform', 'PATCH', `/organizations/${ORG}`, { plan: 'enterprise' })).status).toBe(400);
      expect((await call('platform', 'PATCH', '/organizations/not-a-uuid', { is_active: false })).status).toBe(400);
    expect((await call('platform', 'PATCH', `/organizations/${ORG}`, { is_active: 'false' })).status).toBe(400);
      const ok = await call('platform', 'PATCH', `/organizations/${ORG}`, { is_active: false });
      expect(ok.status).toBe(200);
      expect(organizations.update).toHaveBeenCalledWith(ORG, { is_active: false });
    });
  });


  describe('payment settings (org-collected payments)', () => {
    it('PATCH /payments/settings is only for owners and admins', async () => {
      expect((await call('agent', 'PATCH', '/payments/settings', { currency: 'usd' })).status).toBe(403);
      expect((await call('owner', 'PATCH', '/payments/settings', { currency: 'usd' })).status).toBe(200);
      expect((await call('admin', 'PATCH', '/payments/settings', { currency: 'usd' })).status).toBe(200);
    });

    it('GET /payments/settings stays readable by members', async () => {
      expect((await call('agent', 'GET', '/payments/settings')).status).toBe(200);
    });
  });

  describe('billing access applied to the product', () => {
    it('a demo organization can use the whole product, including premium features', async () => {
      expect((await call('agent', 'GET', '/crm-feature')).status).toBe(200);
      expect((await call('agent', 'POST', '/crm-feature/calls')).status).toBe(201);
    });

    it('a paid plan without the feature gets 402 on premium routes', async () => {
      currentAccess = access({ is_demo: false, is_paid_plan: true, effective_features: ['contacts'] });
      const res = await call('agent', 'POST', '/crm-feature/calls');
      expect(res.status).toBe(402);
      expect(res.body.errors).toMatchObject({ code: 'PLAN_FEATURE_UNAVAILABLE', feature: 'voice_calls' });
    });

    it('a blocked organization gets 402 on every product route, reads included', async () => {
      currentAccess = BLOCKED;
      for (const [method, path] of [['GET', '/crm-feature'], ['POST', '/crm-feature/calls'], ['GET', '/payments/settings']]) {
        const res = await call('agent', method, path);
        expect(res.status).toBe(402);
        expect(res.body.errors).toMatchObject({ code: 'BILLING_BLOCKED', reasons: ['subscription_unpaid'] });
      }
    });

    it('a blocked organization can still load its session and fix billing', async () => {
      currentAccess = BLOCKED;
      expect((await call('agent', 'GET', '/users/me')).status).toBe(200);
      expect((await call('agent', 'GET', '/organizations/me')).status).toBe(200);
      expect((await call('agent', 'GET', '/billing/status')).status).toBe(200);
      expect((await call('owner', 'POST', '/billing/checkout', { plan_id: PLAN, period: 'monthly' })).status).toBe(200);
      expect((await call('owner', 'POST', '/billing/portal', {})).status).toBe(200);
    });

    it('a suspended organization gets 403 on product routes', async () => {
      currentAccess = access({ level: BillingAccessLevel.SUSPENDED, is_demo: false, reasons: [BillingRestrictionReason.ORGANIZATION_INACTIVE] });
      const res = await call('agent', 'GET', '/crm-feature');
      expect(res.status).toBe(403);
      expect(res.body.errors).toMatchObject({ code: 'ORGANIZATION_SUSPENDED' });
    });

    it('platform admins are never blocked by an organization billing state', async () => {
      currentAccess = BLOCKED;
      expect((await call('platform', 'GET', '/crm-feature')).status).toBe(200);
    });
  });

  describe('platform demo limits', () => {
    const ORG_LIMITS = `/platform/billing/demo/organizations/${OTHER_ORG}/limits`;

    it.each([
      ['GET', '/platform/billing/demo/defaults', undefined],
      ['PATCH', '/platform/billing/demo/defaults', { ai_calls: 50 }],
      ['GET', '/platform/billing/demo/organizations', undefined],
      ['PUT', ORG_LIMITS, { ai_calls: 50 }],
      ['DELETE', ORG_LIMITS, undefined],
    ])('%s %s is platform-admin only', async (method, path, body) => {
      for (const who of ['owner', 'admin', 'agent', 'api_key'] as const) {
        expect((await call(who, method, path, body)).status).toBe(403);
      }
      expect((await call('platform', method, path, body)).status).toBeLessThan(300);
    });

    it.each([
      ['PUT', `/platform/billing/demo/organizations/${OTHER_ORG}/period`, { ends_at: '2026-07-01T00:00:00.000Z' }],
    ])('%s %s (demo period) is platform-admin only', async (method, path, body) => {
      for (const who of ['owner', 'admin', 'agent', 'api_key'] as const) {
        expect((await call(who, method, path, body)).status).toBe(403);
      }
      expect((await call('platform', method, path, body)).status).toBe(204);
    });

    it('extends or moves the demo end date for one organization', async () => {
      await call('platform', 'PUT', `/platform/billing/demo/organizations/${OTHER_ORG}/period`, { ends_at: '2026-07-01T00:00:00.000Z' });
      expect(demoLimits.setDemoPeriod).toHaveBeenCalledWith(OTHER_ORG, new Date('2026-07-01T00:00:00.000Z'), 'u1');
    });

    it('makes an organization free forever with a null end date', async () => {
      await call('platform', 'PUT', `/platform/billing/demo/organizations/${OTHER_ORG}/period`, { ends_at: null });
      expect(demoLimits.setDemoPeriod).toHaveBeenCalledWith(OTHER_ORG, null, 'u1');
    });

    it.each([
      [{}, 'ends_at must be a valid ISO 8601 date string'],
      [{ ends_at: 'next week' }, 'ends_at must be a valid ISO 8601 date string'],
      [{ ends_at: '2026-02-30T00:00:00Z' }, 'ends_at must be a valid ISO 8601 date string'],
    ])('rejects an invalid demo end date %p', async (body, message) => {
      const res = await call('platform', 'PUT', `/platform/billing/demo/organizations/${OTHER_ORG}/period`, body);
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([message]));
    });

    it('changes the length of new demos, or removes their end date', async () => {
      await call('platform', 'PATCH', '/platform/billing/demo/defaults', { demo_duration_days: 14 });
      expect(demoLimits.updateDefaults).toHaveBeenLastCalledWith(expect.any(Object), 14);
      await call('platform', 'PATCH', '/platform/billing/demo/defaults', { demo_duration_days: null });
      expect(demoLimits.updateDefaults).toHaveBeenLastCalledWith(expect.any(Object), null);
      await call('platform', 'PATCH', '/platform/billing/demo/defaults', { ai_calls: 5 });
      expect(demoLimits.updateDefaults).toHaveBeenLastCalledWith(expect.objectContaining({ ai_calls: 5 }), undefined);
    });

    it.each([0, 366, 2.5, 'week'])('rejects a demo length of %p days', async (days) => {
      expect((await call('platform', 'PATCH', '/platform/billing/demo/defaults', { demo_duration_days: days })).status).toBe(400);
    });

    it('updates the defaults with only the metrics sent', async () => {
      await call('platform', 'PATCH', '/platform/billing/demo/defaults', { ai_calls: 50, messages: -1 });
      expect(demoLimits.updateDefaults).toHaveBeenCalledWith(expect.objectContaining({ ai_calls: 50, messages: -1 }), undefined);
    });

    it.each([
      [{ ai_calls: -2 }, 'ai_calls must not be less than -1'],
      [{ ai_calls: 1.5 }, 'ai_calls must be an integer number'],
      [{ messages: 'lots' }, 'messages must be an integer number'],
      [{ storage_gb: 10 }, 'property storage_gb should not exist'],
    ])('rejects invalid limits %p', async (body, message) => {
      const res = await call('platform', 'PATCH', '/platform/billing/demo/defaults', body);
      expect(res.status).toBe(400);
      expect(res.body.message).toEqual(expect.arrayContaining([message]));
    });

    it('sets one organization overrides and records who did it', async () => {
      const res = await call('platform', 'PUT', ORG_LIMITS, { ai_calls: 500 });
      expect(res.status).toBe(204);
      expect(demoLimits.setOverrides).toHaveBeenCalledWith(OTHER_ORG, expect.objectContaining({ ai_calls: 500 }), 'u1');
    });

    it('resets one organization to the defaults', async () => {
      expect((await call('platform', 'DELETE', ORG_LIMITS)).status).toBe(204);
      expect(demoLimits.clearOverrides).toHaveBeenCalledWith(OTHER_ORG, 'u1');
    });

    it('rejects a malformed organization id', async () => {
      expect((await call('platform', 'PUT', '/platform/billing/demo/organizations/nope/limits', {})).status).toBe(400);
    });

    it('lists demo organizations with search and bounded pagination', async () => {
      await call('platform', 'GET', '/platform/billing/demo/organizations?search=acme&page=2&limit=10');
      expect(demoLimits.listOrganizations).toHaveBeenCalledWith('acme', 2, 10);
      expect((await call('platform', 'GET', '/platform/billing/demo/organizations?limit=1000')).status).toBe(400);
    });
  });

  describe('usage limits on user actions', () => {
    const reached = (metric: LimitCheck['metric'], limit: number): LimitCheck => ({ allowed: false, metric, limit, current: limit });

    it.each([
      ['POST', '/conversations', { contact_id: 'c1', channel: 'webchat' }, 'conversations', 100, 'You have reached your limit of 100 conversations this month. Choose a plan to continue.'],
      ['POST', '/conversations/conv-1/messages', { content: 'hi' }, 'messages', 1000, 'You have reached your limit of 1,000 messages this month. Choose a plan to continue.'],
      ['POST', '/users/invite', { email: 'new@acme.test', role: 'agent' }, 'agents', 2, 'You have reached your limit of 2 team members. Choose a plan to continue.'],
      ['POST', '/users', { email: 'new@acme.test', full_name: 'New', auth_user_id: 'a2' }, 'agents', 2, 'You have reached your limit of 2 team members. Choose a plan to continue.'],
    ] as const)('%s %s returns 402 once the %s limit is reached', async (method, path, body, metric, limit, message) => {
      limitCheck = reached(metric, limit);
      const who = path.startsWith('/users') ? 'admin' : 'agent';
      const res = await call(who, method, path, body);
      expect(res.status).toBe(402);
      expect(res.body.message).toBe(message);
      expect(res.body.errors).toMatchObject({ code: 'PLAN_LIMIT_REACHED', metric, limit, current: limit });
    });

    it('lets the action through while under the limit', async () => {
      expect((await call('agent', 'POST', '/conversations/conv-1/messages', { content: 'hi' })).status).toBe(201);
      expect(conversations.sendMessage).toHaveBeenCalled();
    });
  });
});

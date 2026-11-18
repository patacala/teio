import 'reflect-metadata';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import { OptInThrottlerGuard, THROTTLE_LIMIT_METADATA } from './opt-in-throttler.guard';
import { parseTrustProxy } from '../trust-proxy';
import { AuthController } from '../../modules/auth/auth.controller';
import { DemoController } from '../../modules/demo/demo.controller';
import { PublicBookingController } from '../../modules/scheduling/public-booking.controller';
import { PaymentsController } from '../../modules/payments/payments.controller';
import { BillingController } from '../../modules/billing/billing.controller';
import { AIToolsExecuteController } from '../../modules/ai-automation/ai-tools-execute.controller';
import { ChannelWebhookController } from '../../modules/channel-webhooks/channel-webhook.controller';
import { RetellWebhookController } from '../../modules/voice/retell-webhook.controller';
import { PaymentWebhookController } from '../../modules/payments/payment-webhook.controller';
import { DemoWebhookController } from '../../modules/demo/demo-webhook.controller';
import { IngestController } from '../../modules/conversation-management/ingest.controller';
import { HealthController } from '../../health.controller';

@Controller('t')
class TestController {
  @Get('open')
  open() {
    return 'ok';
  }

  @Get('limited')
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  limited() {
    return 'ok';
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [TestController],
  providers: [{ provide: APP_GUARD, useClass: OptInThrottlerGuard }],
})
class TestModule {}

describe('OptInThrottlerGuard (HTTP)', () => {
  let app: INestApplication;
  let base: string;

  beforeEach(async () => {
    const nest = await NestFactory.create<NestExpressApplication>(TestModule, { logger: false });
    nest.set('trust proxy', parseTrustProxy(undefined));
    // Stand-in for TenantContextMiddleware: who is calling.
    nest.use((req: Request, _res: Response, next: NextFunction) => {
      const user = req.headers['x-test-user'] as string | undefined;
      const keyOrg = req.headers['x-test-api-key-org'] as string | undefined;
      if (user) req.user = { id: user, auth_user_id: null, email: null, role: 'admin', organization_id: 'org-x' };
      if (keyOrg) req.user = { id: 'api-key', auth_user_id: null, email: null, role: 'api_key', organization_id: keyOrg };
      next();
    });
    await nest.listen(0, '127.0.0.1');
    app = nest;
    base = (await nest.getUrl()).replace('[::1]', '127.0.0.1');
  });
  afterEach(async () => app.close());

  const hit = async (path: string, headers: Record<string, string> = {}) => (await fetch(`${base}${path}`, { headers })).status;
  const hitN = async (n: number, path: string, headers: Record<string, string> = {}) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(await hit(path, headers));
    return out;
  };

  it('never limits routes without @Throttle', async () => {
    expect(await hitN(8, '/t/open')).toEqual(Array(8).fill(200));
  });

  it('limits routes with @Throttle', async () => {
    expect(await hitN(3, '/t/limited')).toEqual([200, 200, 429]);
  });

  it('counts each client IP behind the proxy separately', async () => {
    expect(await hitN(3, '/t/limited', { 'x-forwarded-for': '203.0.113.5' })).toEqual([200, 200, 429]);
    expect(await hit('/t/limited', { 'x-forwarded-for': '198.51.100.7' })).toBe(200);
  });

  it('ignores a spoofed X-Forwarded-For prefix (the proxy-appended address is used)', async () => {
    const statuses = [];
    for (const spoof of ['1.1.1.1', '8.8.8.8', '9.9.9.9']) {
      statuses.push(await hit('/t/limited', { 'x-forwarded-for': `${spoof}, 203.0.113.5` }));
    }
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('counts signed-in users by user, not by shared IP', async () => {
    expect(await hitN(3, '/t/limited', { 'x-test-user': 'u1' })).toEqual([200, 200, 429]);
    expect(await hit('/t/limited', { 'x-test-user': 'u2' })).toBe(200);
  });

  it('counts API keys by organization (all keys share the placeholder user id)', async () => {
    expect(await hitN(3, '/t/limited', { 'x-test-api-key-org': 'org-a' })).toEqual([200, 200, 429]);
    expect(await hit('/t/limited', { 'x-test-api-key-org': 'org-b' })).toBe(200);
  });
});

describe('rate-limit policy', () => {
  type Ctor = { prototype: any; name: string };
  const limitOf = (controller: Ctor, method: string): number | undefined => {
    const handler = controller.prototype[method];
    if (typeof handler !== 'function') throw new Error(`${controller.name}.${method} does not exist`);
    return Reflect.getMetadata(THROTTLE_LIMIT_METADATA, handler) ?? Reflect.getMetadata(THROTTLE_LIMIT_METADATA, controller);
  };

  it('pins the metadata key @Throttle writes (a library rename must fail here)', () => {
    expect(Reflect.getMetadata(THROTTLE_LIMIT_METADATA, TestController.prototype.limited)).toBe(2);
  });

  it.each([
    [AuthController, 'forgotPassword', 5],
    [AuthController, 'resetPassword', 10],
    [DemoController, 'initDemo', 3],
    [DemoController, 'submitDemo', 5],
    [DemoController, 'getDemoStatus', 120],
    [DemoController, 'validateDemoExperience', 30],
    [PublicBookingController, 'show', 60],
    [PublicBookingController, 'chooseTime', 60],
    [PublicBookingController, 'askCancel', 60],
    [PublicBookingController, 'confirm', 20],
    [PublicBookingController, 'reschedule', 20],
    [PublicBookingController, 'cancel', 20],
    [PaymentsController, 'returnPage', 30],
    [BillingController, 'getPlans', 60],
    [AIToolsExecuteController, 'execute', 30],
  ] as Array<[Ctor, string, number]>)('%p.%s is limited to %d', (controller, method, limit) => {
    expect(limitOf(controller, method)).toBe(limit);
  });

  it.each([
    [ChannelWebhookController, 'verify'],
    [ChannelWebhookController, 'receive'],
    [RetellWebhookController, 'handleRetellWebhook'],
    [BillingController, 'stripeWebhook'],
    [PaymentWebhookController, 'receive'],
    [DemoWebhookController, 'demoReady'],
    [IngestController, 'ingestMessage'],
    [HealthController, 'check'],
  ] as Array<[Ctor, string]>)('%p.%s (provider webhook / health) is never limited', (controller, method) => {
    expect(limitOf(controller, method)).toBeUndefined();
  });
});

/// <reference types="jest" />
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import Stripe from 'stripe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';
import { TransformInterceptor } from '../../common/interceptors/transform.interceptor';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentsService } from './payments.service';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ORG_UNCONFIGURED = '33333333-3333-4333-8333-333333333333';
const SECRETS: Record<string, { stripe_secret_key: string | null; stripe_webhook_secret: string | null }> = {
  [ORG_A]: { stripe_secret_key: 'sk_test_a', stripe_webhook_secret: 'whsec_org_a_secret' },
  [ORG_B]: { stripe_secret_key: 'sk_test_b', stripe_webhook_secret: 'whsec_org_b_secret' },
  [ORG_UNCONFIGURED]: { stripe_secret_key: null, stripe_webhook_secret: null },
};

/**
 * The Stripe webhook only acts on events whose signature matches the raw
 * request bytes and the organization's own signing secret. Runs the real
 * verification (Stripe SDK) behind the same body parsing as main.ts.
 */
describe('Stripe webhook signature verification (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let payments: PaymentsService;
  let handled: jest.SpyInstance;
  const stripe = new Stripe('sk_test_signing');

  beforeAll(async () => {
    const settings = { getRaw: async (orgId: string) => SECRETS[orgId] ?? { stripe_secret_key: null, stripe_webhook_secret: null } };
    const stub = {} as never;
    payments = new PaymentsService(stub, stub, stub, stub, settings as never, stub, stub, stub, stub, stub);
    handled = jest.spyOn(payments, 'handleWebhookEvent').mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentWebhookController],
      providers: [
        { provide: PaymentsService, useValue: payments },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();

    // Same body handling as main.ts: own parsers, raw bytes kept for HMAC checks.
    const express = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true, bodyParser: false });
    express.useBodyParser('json', { limit: '20mb' });
    express.useBodyParser('urlencoded', { extended: true, limit: '20mb' });
    app = express;
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as { port: number }).port}/api/v1/webhooks/payments/stripe`;
  });

  afterAll(async () => app?.close());
  beforeEach(() => handled.mockClear());

  const event = {
    id: 'evt_test_1',
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: { id: 'cs_test_1', object: 'checkout.session', payment_status: 'paid' } },
  };

  function signed(payload: string, secret: string, timestamp?: number) {
    return stripe.webhooks.generateTestHeaderString({ payload, secret, ...(timestamp ? { timestamp } : {}) });
  }

  async function post(orgId: string, body: string, signature?: string) {
    const res = await fetch(`${baseUrl}/${orgId}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(signature ? { 'stripe-signature': signature } : {}) },
      body,
    });
    return { status: res.status, body: (await res.json()) as { data?: unknown; message?: string } };
  }

  it('accepts a correctly signed event without a CRM session and hands over the parsed event', async () => {
    const payload = JSON.stringify(event);
    const res = await post(ORG_A, payload, signed(payload, SECRETS[ORG_A].stripe_webhook_secret!));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true });
    expect(handled).toHaveBeenCalledWith(ORG_A, expect.objectContaining({ id: 'evt_test_1', type: 'checkout.session.completed' }));
  });

  it('rejects a request without a signature', async () => {
    const res = await post(ORG_A, JSON.stringify(event));
    expect(res.status).toBe(401);
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects an event signed with another organization’s secret', async () => {
    const payload = JSON.stringify(event);
    const res = await post(ORG_A, payload, signed(payload, SECRETS[ORG_B].stripe_webhook_secret!));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Webhook signature verification failed');
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects a payload changed after signing, even by whitespace', async () => {
    const payload = JSON.stringify(event);
    const signature = signed(payload, SECRETS[ORG_A].stripe_webhook_secret!);
    const tampered = JSON.stringify({ ...event, data: { object: { ...event.data.object, payment_status: 'paid', amount_total: 1 } } });
    expect((await post(ORG_A, tampered, signature)).status).toBe(400);
    expect((await post(ORG_A, JSON.stringify(event, null, 2), signature)).status).toBe(400);
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects a replayed event whose signature is older than the tolerance', async () => {
    const payload = JSON.stringify(event);
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    const res = await post(ORG_A, payload, signed(payload, SECRETS[ORG_A].stripe_webhook_secret!, tenMinutesAgo));
    expect(res.status).toBe(400);
    expect(handled).not.toHaveBeenCalled();
  });

  it('rejects events for an organization without Stripe configured, and malformed organization ids', async () => {
    const payload = JSON.stringify(event);
    expect((await post(ORG_UNCONFIGURED, payload, signed(payload, 'whsec_anything'))).status).toBe(400);
    expect((await post('not-a-uuid', payload, signed(payload, SECRETS[ORG_A].stripe_webhook_secret!))).status).toBe(400);
    expect(handled).not.toHaveBeenCalled();
  });
});

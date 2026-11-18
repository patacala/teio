import { DemoType } from '@crm/shared';
import { DemoService } from './demo.service';

function build(contact: Record<string, unknown>, templateId = '') {
  const mail = { send: jest.fn(async (_arg: Record<string, unknown>) => undefined) };
  const clients = { findById: jest.fn(async () => contact) };
  const config = { get: jest.fn((key: string, d?: unknown) => (key === 'mail.demoTemplateId' ? templateId : d)) };
  const service = new DemoService({} as never, {} as never, {} as never, clients as never, mail as never, config as never, {} as never);
  const sendReady = (url = 'https://app.test/demo/x?t=1&u=2') =>
    (service as unknown as { sendDemoReadyEmail: (...a: unknown[]) => Promise<void> }).sendDemoReadyEmail(
      'c1', 'org', url, DemoType.AI_VOICE,
    );
  return { mail, sendReady };
}

describe('DemoService demo-ready email', () => {
  it('sends the built-in English email with every public-form value escaped', async () => {
    const { mail, sendReady } = build({ email: 'lead@x.com', first_name: '<img src=x onerror=alert(1)>Ana' });
    await sendReady();
    const sent = mail.send.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe('lead@x.com');
    expect(sent.subject).toBe('Your demo is ready!');
    expect(sent.html).toContain('Hi &lt;img src=x onerror=alert(1)&gt;Ana,');
    expect(sent.html).not.toContain('<img');
    expect(sent.html).toContain('Your personalized demo (AI voice) is ready.');
    expect(sent.html).toContain('href="https://app.test/demo/x?t=1&amp;u=2"');
  });

  it('still uses the provider template when MAIL_DEMO_TEMPLATE_ID is set', async () => {
    const { mail, sendReady } = build({ email: 'lead@x.com', first_name: 'Ana' }, 'tpl_demo');
    await sendReady();
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'tpl_demo' }));
  });
});

describe('DemoService demo generator request', () => {
  const request = async (settings: Record<string, string>) => {
    const config = { get: jest.fn((key: string, d?: unknown) => settings[key] ?? d) };
    const service = new DemoService({} as never, {} as never, {} as never, {} as never, {} as never, config as never, {} as never);
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const original = global.fetch;
    global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init! });
      return new Response('{}');
    }) as typeof fetch;
    try {
      await (service as unknown as { requestDemoGeneration: (...a: unknown[]) => Promise<void> }).requestDemoGeneration(
        'c1', 'co1', 'https://acme.test', DemoType.AI_VOICE, 'req-1',
      );
    } finally {
      global.fetch = original;
    }
    return calls;
  };

  it('posts the request to the demo generator, signed with the demo secret', async () => {
    const calls = await request({ 'demo.generatorUrl': 'https://demos.test/build', 'demo.webhookSecret': 's3cret', 'webhooks.baseUrl': 'https://api.test' });
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe('https://demos.test/build');
    const body = String(init.body);
    expect(JSON.parse(body)).toEqual({
      contact_id: 'c1',
      company_id: 'co1',
      website: 'https://acme.test',
      demo_type: DemoType.AI_VOICE,
      request_id: 'req-1',
      callback_url: 'https://api.test/api/v1/webhooks/demo-ready',
    });
    const { createHmac } = await import('crypto');
    expect((init.headers as Record<string, string>)['X-Signature']).toBe(`sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`);
    expect((init.headers as Record<string, string>)['X-Request-Id']).toBe('req-1');
  });

  it('does nothing without a generator configured', async () => {
    expect(await request({})).toEqual([]);
  });
});

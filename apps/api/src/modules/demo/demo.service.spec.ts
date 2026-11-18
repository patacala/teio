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

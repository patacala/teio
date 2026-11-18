import { ToolExecutionService } from './tool-execution.service';

const CONTACT = '6f1c2d3e-1111-4222-8333-444455556666';

function build(contact: Record<string, unknown> = { id: CONTACT, email: 'ana@x.com', phone: '+15550100' }) {
  const mail = { send: jest.fn(async (_arg: { to: string; subject: string; html: string }) => undefined) };
  const sms = { send: jest.fn(async (_arg: { to: string; text: string }) => ({ providerId: 'sms-1' })) };
  const clients = { findById: jest.fn(async () => contact) };
  const service = new ToolExecutionService(
    { create: (x: unknown) => x, save: async (x: unknown) => x } as never,
    { findToolByName: async () => null } as never,
    {} as never,
    clients as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: jest.fn() } as never,
    mail as never,
    sms as never,
  );
  return { service, mail, sms, clients };
}

describe('AI tool send_email', () => {
  it('sends the agent text escaped inside the email layout (no HTML injection)', async () => {
    const { service, mail } = build();
    await service.execute('org', 'agent', 'send_email', {
      contact_id: CONTACT,
      subject: 'Your quote\r\nBcc: evil@x.com',
      body: 'Hi Ana,\n<a href="https://evil.example">Click here</a><script>alert(1)</script>',
    });
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('ana@x.com');
    expect(sent.subject).toBe('Your quote Bcc: evil@x.com');
    expect(sent.html).toContain('Hi Ana,<br>&lt;a href=&quot;https://evil.example&quot;&gt;Click here&lt;/a&gt;&lt;script&gt;');
    expect(sent.html).not.toContain('<script>');
    expect(sent.html).not.toContain('href="https://evil.example"');
  });

  it.each([
    [{ subject: '', body: 'x' }, 'subject must be a non-empty string'],
    [{ subject: 'Hi', body: 42 }, 'body must be a non-empty string'],
    [{ subject: 'x'.repeat(201), body: 'x' }, 'subject must be at most 200 characters'],
    [{ subject: 'Hi', body: 'x'.repeat(10_001) }, 'body must be at most 10000 characters'],
  ])('rejects invalid input %#', async (input, message) => {
    const { service, mail, clients } = build();
    await expect(service.execute('org', 'agent', 'send_email', { contact_id: CONTACT, ...input })).rejects.toThrow(message);
    expect(clients.findById).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe('AI tool send_sms', () => {
  it('sends the trimmed text', async () => {
    const { service, sms } = build();
    await service.execute('org', 'agent', 'send_sms', { contact_id: CONTACT, message: '  See you tomorrow  ' });
    expect(sms.send).toHaveBeenCalledWith({ to: '+15550100', text: 'See you tomorrow' });
  });

  it('rejects empty or oversized messages before looking anything up', async () => {
    const { service, sms, clients } = build();
    await expect(service.execute('org', 'agent', 'send_sms', { contact_id: CONTACT, message: ' ' })).rejects.toThrow(
      'message must be a non-empty string',
    );
    await expect(
      service.execute('org', 'agent', 'send_sms', { contact_id: CONTACT, message: 'x'.repeat(1_601) }),
    ).rejects.toThrow('message must be at most 1600 characters');
    expect(clients.findById).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });
});

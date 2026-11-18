import { SendEmailHandler } from './send-email.handler';

function build() {
  const mail = { send: jest.fn(async (_arg: { to: string; subject: string; html: string }) => undefined) };
  return { handler: new SendEmailHandler(mail as never), mail };
}

const org = { id: 'org', name: 'Clínica Sol' } as never;
const step = (overrides: Record<string, unknown> = {}) =>
  ({ id: 'a1', organization_id: 'org', title: 'Seguimiento', message_content: null, ...overrides }) as never;

describe('SendEmailHandler', () => {
  it('emails the step content, escaped, with line breaks kept', async () => {
    const { handler, mail } = build();
    const result = await handler.execute(
      step({ message_content: 'Hi Ana,\n<b>Shall we continue?</b>' }),
      { id: 'c1', email: 'ana@x.com', first_name: 'Ana' } as never,
      null,
      org,
    );
    expect(result).toEqual({ completed: true, channel: 'email' });
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('ana@x.com');
    expect(sent.subject).toBe('Seguimiento');
    expect(sent.html).toContain('Hi Ana,<br>&lt;b&gt;Shall we continue?&lt;/b&gt;');
    expect(sent.html).toContain('Clínica Sol');
  });

  it('falls back to the English follow-up text, addressed to the contact ({{user_name}})', async () => {
    const { handler, mail } = build();
    await handler.execute(step(), { id: 'c1', email: 'ana@x.com', first_name: 'Ana', last_name: 'García' } as never, null, org);
    expect(mail.send.mock.calls[0][0].html).toContain(
      'Hi Ana García, we&#39;re following up to see if there&#39;s anything we can help you with. - Clínica Sol',
    );
  });

  it('fails the step when the contact has no email', async () => {
    const { handler, mail } = build();
    await expect(handler.execute(step(), { id: 'c1', email: null } as never, null, org)).rejects.toThrow('has no email');
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('fails the step when the provider rejects the email (so it can be retried)', async () => {
    const { handler, mail } = build();
    mail.send.mockRejectedValueOnce(new Error('provider down'));
    await expect(
      handler.execute(step(), { id: 'c1', email: 'ana@x.com', first_name: 'Ana' } as never, null, org),
    ).rejects.toThrow('provider down');
  });
});

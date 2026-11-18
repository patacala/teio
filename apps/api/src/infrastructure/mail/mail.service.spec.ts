import { MailService } from './mail.service';

describe('MailService sender', () => {
  const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({ ok: true, text: async () => '' }));
  const realFetch = global.fetch;
  beforeAll(() => { global.fetch = fetchMock as never; });
  afterAll(() => { global.fetch = realFetch; });
  beforeEach(() => fetchMock.mockClear());

  function service(values: Record<string, string>) {
    return new MailService({ get: (key: string) => values[key] } as never);
  }
  const sentFrom = () => JSON.parse(fetchMock.mock.calls[0][1].body).from;

  it('uses MAIL_FROM', async () => {
    await service({ 'mail.provider': 'resend', 'mail.from': 'hello@acme.test' }).send({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(sentFrom()).toBe('hello@acme.test');
  });

  it('treats an empty MAIL_FROM as unset instead of sending with an empty sender', async () => {
    await service({ 'mail.provider': 'resend', 'mail.from': '' }).send({ to: 'a@b.co', subject: 's', html: 'h' });
    expect(sentFrom()).toBe('noreply@example.com');
  });

  it('lets the caller override the sender', async () => {
    await service({ 'mail.provider': 'resend', 'mail.from': 'hello@acme.test' }).send({ to: 'a@b.co', subject: 's', html: 'h', from: 'x@acme.test' });
    expect(sentFrom()).toBe('x@acme.test');
  });
});

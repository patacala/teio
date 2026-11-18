import * as jwt from 'jsonwebtoken';
import { TenantContextMiddleware } from './tenant-context.middleware';

// Only the API-key path uses bcrypt and only the JWKS path uses jose (ESM-only);
// these tests go through the legacy HS256 secret, so keep both out.
jest.mock('bcrypt', () => ({ compare: jest.fn() }));
jest.mock('jose', () => ({ createRemoteJWKSet: jest.fn(), jwtVerify: jest.fn() }));

const SECRET = 'legacy-secret';
const flush = () => new Promise((r) => setImmediate(r));

function token(claims: Record<string, unknown>) {
  return jwt.sign({ aud: 'authenticated', ...claims }, SECRET);
}

function build(opts: { existingUser?: boolean; welcomeAlreadyClaimed?: boolean; mailFails?: boolean } = {}) {
  const user = { id: 'u1', email: 'new.owner@acme.test', full_name: 'new-owner', organization_id: 'org-1', role: 'admin' };
  const users = {
    findByAuthUserId: jest.fn(async () => (opts.existingUser ? user : null)),
    findOrCreate: jest.fn(async (_sub: string, email: string) => ({ ...user, email, full_name: email.split('@')[0] })),
    touchLastSeen: jest.fn(async () => undefined),
  };
  const orgs = {
    findBySlug: jest.fn(async () => null),
    create: jest.fn(async () => ({ id: 'org-1', name: 'new.owner' })),
    findById: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string) =>
      ({ 'supabase.url': '', 'supabase.jwtSecret': SECRET, NEXT_PUBLIC_WEB_URL: 'https://app.test/' })[key],
    ),
  };
  const redis = {
    get: jest.fn(async () => null),
    setex: jest.fn(async () => 'OK'),
    set: jest.fn(async () => (opts.welcomeAlreadyClaimed ? null : 'OK')),
  };
  const mail = {
    send: jest.fn(async (_arg: { to: string; subject: string; html: string }) => {
      if (opts.mailFails) throw new Error('provider down');
    }),
  };
  const middleware = new TenantContextMiddleware(
    users as never, {} as never, orgs as never, config as never, redis as never, mail as never,
  );
  return { middleware, users, redis, mail };
}

async function run(middleware: TenantContextMiddleware, bearer: string) {
  const req = { headers: { authorization: `Bearer ${bearer}` } } as never as { user?: { id: string } };
  const next = jest.fn();
  await middleware.use(req as never, {} as never, next);
  await flush();
  return { req, next };
}

describe('TenantContextMiddleware welcome email', () => {
  it('welcomes a self-signup on first login, in English, linking to the web app', async () => {
    const { middleware, mail, redis } = build();
    const { req, next } = await run(middleware, token({ sub: 'auth-1', email: 'new.owner@acme.test' }));

    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe('u1');
    expect(redis.set).toHaveBeenCalledWith('welcome-sent:auth-1', '1', 'EX', 7 * 24 * 3600, 'NX');
    expect(mail.send).toHaveBeenCalledTimes(1);
    const sent = mail.send.mock.calls[0][0];
    expect(sent.to).toBe('new.owner@acme.test');
    expect(sent.subject).toBe('Welcome! Your account is ready');
    expect(sent.html).toContain('<html lang="en">');
    expect(sent.html).toContain('Hi new.owner,');
    expect(sent.html).toContain('href="https://app.test"');
  });

  it('does not welcome twice when parallel first requests both provision', async () => {
    const { middleware, mail } = build({ welcomeAlreadyClaimed: true });
    await run(middleware, token({ sub: 'auth-1', email: 'new.owner@acme.test' }));
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('does not welcome existing users', async () => {
    const { middleware, mail, users } = build({ existingUser: true });
    await run(middleware, token({ sub: 'auth-1', email: 'new.owner@acme.test' }));
    expect(users.findOrCreate).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('never mails the placeholder address when the token has no email', async () => {
    const { middleware, mail, users } = build();
    await run(middleware, token({ sub: 'auth-12345678' }));
    expect(users.findOrCreate).toHaveBeenCalledWith('auth-12345678', 'user-auth-123@local', 'org-1', 'admin');
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('still authenticates the request when the welcome email fails', async () => {
    const { middleware, mail } = build({ mailFails: true });
    const { req, next } = await run(middleware, token({ sub: 'auth-1', email: 'new.owner@acme.test' }));
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
    expect(req.user?.id).toBe('u1');
  });
});

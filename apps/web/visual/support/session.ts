import type { BrowserContext } from '@playwright/test';
import testUser from './test-user.json';
import { APP_URL, SUPABASE_URL } from './env';

const base64url = (value: string) => Buffer.from(value).toString('base64url');

function accessToken(): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({ sub: testUser.id, email: testUser.email, aud: 'authenticated', role: 'authenticated', exp: 4102444800 }),
  );
  return `${header}.${payload}.visual-test`;
}

/** Signs the browser in the way @supabase/ssr expects (cookie `sb-<project ref>-auth-token`). */
export async function signIn(context: BrowserContext): Promise<void> {
  const session = {
    access_token: accessToken(),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: 4102444800,
    refresh_token: 'visual-refresh-token',
    user: testUser,
  };
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
  await context.addCookies([
    {
      name: `sb-${projectRef}-auth-token`,
      value: `base64-${base64url(JSON.stringify(session))}`,
      url: APP_URL,
    },
  ]);
}

export { testUser };

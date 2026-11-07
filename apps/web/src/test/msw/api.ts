import { http, HttpResponse } from 'msw';
import { expect, it } from 'vitest';
import { server } from './server';
import { TEST_ACCESS_TOKEN } from '../supabase';

export const API_BASE = 'http://api.test/api/v1';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface CapturedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

interface MockApiOptions {
  data?: unknown;
  status?: number;
  message?: string;
}

async function readBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) return request.formData();
  const text = await request.text();
  return text ? JSON.parse(text) : undefined;
}

/**
 * Registers a one-off handler for `method path` that replies with the API's
 * `{ data }` envelope (or an error / 204) and records every matching request.
 */
export function mockApi(method: Method, path: string, options: MockApiOptions = {}) {
  const { data = null, status = 200, message = 'Request failed' } = options;
  const calls: CapturedRequest[] = [];

  server.use(
    http[method](`${API_BASE}${path}`, async ({ request }) => {
      calls.push({
        method: request.method,
        url: new URL(request.url),
        headers: request.headers,
        body: await readBody(request),
      });
      if (status === 204) return new HttpResponse(null, { status });
      if (status >= 400) return HttpResponse.json({ message }, { status });
      return HttpResponse.json({ data }, { status });
    }),
  );

  return calls;
}

export interface EndpointCase {
  name: string;
  call: () => Promise<unknown>;
  method: Method;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

/**
 * One test per endpoint: the request must hit `method path` with exactly the
 * expected query params and JSON body, carry the bearer token, and the
 * service must resolve with the unwrapped `data` of the response.
 */
export function itCallsEndpoints(cases: EndpointCase[]) {
  it.each(cases)('$name → $method $path', async ({ call, method, path, query = {}, body }) => {
    const response = { id: 'response-sentinel' };
    const calls = mockApi(method, path, { data: response });

    await expect(call()).resolves.toEqual(response);

    expect(calls).toHaveLength(1);
    const [request] = calls;
    expect(Object.fromEntries(request.url.searchParams)).toEqual(query);
    expect(request.body).toEqual(body);
    expect(request.headers.get('authorization')).toBe(`Bearer ${TEST_ACCESS_TOKEN}`);
  });
}

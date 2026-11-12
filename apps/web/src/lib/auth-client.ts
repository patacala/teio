import { createClient } from './supabase';

const rawUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const API_URL = rawUrl.replace(/\/+$/, '').replace(/\/api$/, '');

let _impersonatedOrgId: string | null = null;

export function setImpersonatedOrgId(id: string | null) {
  _impersonatedOrgId = id;
}

async function getToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function refreshToken(): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.refreshSession();
  return session?.access_token ?? null;
}

/** Thrown for non-2xx responses; keeps the HTTP status and the API's structured `errors`. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get code(): string | undefined {
    return typeof this.errors?.code === 'string' ? this.errors.code : undefined;
  }
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = await getToken();

  // FormData bodies (file uploads) must NOT get a manual Content-Type — the
  // browser sets multipart/form-data with the correct boundary itself.
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };

  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (_impersonatedOrgId) headers['x-organization-id'] = _impersonatedOrgId;

  const response = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers,
  });

  // Token expired — refresh once and retry
  if (response.status === 401 && retry) {
    const newToken = await refreshToken();
    if (newToken) {
      return request<T>(path, options, false);
    }
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ message: 'Request failed' }))) as {
      message?: string | string[];
      errors?: Record<string, unknown>;
    };
    const message = Array.isArray(error.message) ? error.message.join(', ') : error.message;
    throw new ApiError(message ?? 'Request failed', response.status, error.errors);
  }

  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  const json = await response.json() as { data: T };
  return json.data;
}

export const authClient = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  uploadFile: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
};

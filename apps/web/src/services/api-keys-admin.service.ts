import { authClient } from '@/lib/auth-client';

export interface ApiKey {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at?: string;
  expires_at?: string;
  created_at: string;
}

export interface ApiKeyCreated extends ApiKey {
  key: string;
}

export interface CreateApiKeyBody {
  name: string;
  scopes?: string[];
}

export const apiKeysAdminService = {
  getApiKeys: () =>
    authClient.get<ApiKey[]>('/api-keys'),

  createApiKey: (body: CreateApiKeyBody) =>
    authClient.post<ApiKeyCreated>('/api-keys', body),

  revokeApiKey: (id: string) =>
    authClient.delete<void>(`/api-keys/${id}`),
};

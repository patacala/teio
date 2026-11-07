import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { apiKeysAdminService } from './api-keys-admin.service';

describe('apiKeysAdminService', () => {
  itCallsEndpoints([
    { name: 'getApiKeys', call: () => apiKeysAdminService.getApiKeys(), method: 'get', path: '/api-keys' },
    {
      name: 'createApiKey',
      call: () => apiKeysAdminService.createApiKey({ name: 'n8n', scopes: ['contacts:read'] }),
      method: 'post',
      path: '/api-keys',
      body: { name: 'n8n', scopes: ['contacts:read'] },
    },
    { name: 'revokeApiKey', call: () => apiKeysAdminService.revokeApiKey('key-1'), method: 'delete', path: '/api-keys/key-1' },
  ]);

  it('returns the one-time plain key from createApiKey', async () => {
    mockApi('post', '/api-keys', { data: { id: 'key-1', key: 'sk_live_secret', key_prefix: 'sk_live' } });

    const created = await apiKeysAdminService.createApiKey({ name: 'n8n' });

    expect(created.key).toBe('sk_live_secret');
  });

  it('resolves to undefined when revoking returns 204 No Content', async () => {
    mockApi('delete', '/api-keys/key-1', { status: 204 });

    await expect(apiKeysAdminService.revokeApiKey('key-1')).resolves.toBeUndefined();
  });
});

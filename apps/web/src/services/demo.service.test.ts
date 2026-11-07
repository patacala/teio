import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { demoService } from './demo.service';

describe('demoService', () => {
  itCallsEndpoints([
    { name: 'getDemoRequests without params', call: () => demoService.getDemoRequests(), method: 'get', path: '/demo/requests' },
    {
      name: 'getDemoRequests with pagination',
      call: () => demoService.getDemoRequests({ page: 2, limit: 25 }),
      method: 'get',
      path: '/demo/requests',
      query: { page: '2', limit: '25' },
    },
    {
      name: 'revokeDemoLink',
      call: () => demoService.revokeDemoLink('link-1'),
      method: 'patch',
      path: '/demo/links/link-1/revoke',
      body: {},
    },
    {
      name: 'sendDemoEmail to an explicit address',
      call: () => demoService.sendDemoEmail('req-1', 'lead@acme.test'),
      method: 'post',
      path: '/demo/requests/req-1/send-email',
      body: { email: 'lead@acme.test' },
    },
    {
      name: 'sendDemoEmail to the contact on file',
      call: () => demoService.sendDemoEmail('req-1'),
      method: 'post',
      path: '/demo/requests/req-1/send-email',
      body: {},
    },
  ]);

  it('returns the paginated items and meta', async () => {
    const page = {
      items: [{ id: 'req-1', demo_type: 'crm', status: 'ready' }],
      meta: { total: 1, page: 1, limit: 20, total_pages: 1 },
    };
    mockApi('get', '/demo/requests', { data: page });

    await expect(demoService.getDemoRequests()).resolves.toEqual(page);
  });
});

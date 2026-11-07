import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { activityService } from './activity.service';

describe('activityService', () => {
  itCallsEndpoints([
    {
      name: 'getContactActivity first page uses limit 50',
      call: () => activityService.getContactActivity('contact-1'),
      method: 'get',
      path: '/contacts/contact-1/activity',
      query: { limit: '50' },
    },
    {
      name: 'getContactActivity next page passes the cursor',
      call: () => activityService.getContactActivity('contact-1', 'cursor-abc', 20),
      method: 'get',
      path: '/contacts/contact-1/activity',
      query: { limit: '20', cursor: 'cursor-abc' },
    },
  ]);

  it('returns the events and the next cursor', async () => {
    const page = {
      events: [{ type: 'system_event', id: 'e-1', content: 'Contact created', timestamp: '2026-03-15T12:00:00Z' }],
      next_cursor: 'cursor-next',
    };
    mockApi('get', '/contacts/contact-1/activity', { data: page });

    await expect(activityService.getContactActivity('contact-1')).resolves.toEqual(page);
  });
});

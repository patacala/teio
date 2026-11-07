import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { webhooksService } from './webhooks.service';

describe('webhooksService', () => {
  itCallsEndpoints([
    { name: 'getWebhooks', call: () => webhooksService.getWebhooks(), method: 'get', path: '/webhooks' },
    {
      name: 'createWebhook',
      call: () =>
        webhooksService.createWebhook({
          name: 'Zapier',
          url: 'https://hooks.test/abc',
          events: ['contact.created'],
          secret: 's3cr3t',
        }),
      method: 'post',
      path: '/webhooks',
      body: { name: 'Zapier', url: 'https://hooks.test/abc', events: ['contact.created'], secret: 's3cr3t' },
    },
    {
      name: 'updateWebhook',
      call: () => webhooksService.updateWebhook('wh-1', { is_active: false }),
      method: 'patch',
      path: '/webhooks/wh-1',
      body: { is_active: false },
    },
    { name: 'deleteWebhook', call: () => webhooksService.deleteWebhook('wh-1'), method: 'delete', path: '/webhooks/wh-1' },
    {
      name: 'getWebhookLogs defaults to 50 entries',
      call: () => webhooksService.getWebhookLogs('wh-1'),
      method: 'get',
      path: '/webhooks/wh-1/logs',
      query: { limit: '50' },
    },
    {
      name: 'getWebhookLogs with a custom limit',
      call: () => webhooksService.getWebhookLogs('wh-1', 10),
      method: 'get',
      path: '/webhooks/wh-1/logs',
      query: { limit: '10' },
    },
    { name: 'testWebhook', call: () => webhooksService.testWebhook('wh-1'), method: 'post', path: '/webhooks/wh-1/test', body: {} },
  ]);

  it('returns the delivery result of a test ping', async () => {
    mockApi('post', '/webhooks/wh-1/test', { data: { success: false, status_code: 500, error: 'Bad gateway' } });

    await expect(webhooksService.testWebhook('wh-1')).resolves.toEqual({
      success: false,
      status_code: 500,
      error: 'Bad gateway',
    });
  });
});

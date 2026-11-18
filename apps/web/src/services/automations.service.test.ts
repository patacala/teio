import { describe, expect, it } from 'vitest';
import type { AutomationDefinition } from '@crm/shared';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { automationsService } from './automations.service';

const draft = {
  triggers: [{ key: 'manual' }],
  graph: { nodes: [{ key: 'w', type: 'wait', config: { mode: 'duration', duration: { amount: 1, unit: 'days' } } }], edges: [] },
  settings: {},
} as unknown as AutomationDefinition;

describe('automationsService', () => {
  itCallsEndpoints([
    { name: 'list', call: () => automationsService.list(), method: 'get', path: '/automations' },
    { name: 'get', call: () => automationsService.get('a-1'), method: 'get', path: '/automations/a-1' },
    { name: 'catalog', call: () => automationsService.catalog(), method: 'get', path: '/automations/catalog' },
    {
      name: 'create from a template',
      call: () => automationsService.create({ name: 'Welcome', category: 'messaging', draft }),
      method: 'post',
      path: '/automations',
      body: { name: 'Welcome', category: 'messaging', draft },
    },
    { name: 'rename', call: () => automationsService.rename('a-1', { name: 'New' }), method: 'patch', path: '/automations/a-1', body: { name: 'New' } },
    { name: 'saveDraft', call: () => automationsService.saveDraft('a-1', draft), method: 'put', path: '/automations/a-1/draft', body: draft },
    { name: 'validate', call: () => automationsService.validate(draft), method: 'post', path: '/automations/validate', body: draft },
    { name: 'publish', call: () => automationsService.publish('a-1'), method: 'post', path: '/automations/a-1/publish', body: {} },
    { name: 'pause keeping runs', call: () => automationsService.pause('a-1'), method: 'post', path: '/automations/a-1/pause', body: { stop_runs: false } },
    { name: 'pause stopping runs', call: () => automationsService.pause('a-1', true), method: 'post', path: '/automations/a-1/pause', body: { stop_runs: true } },
    { name: 'resume', call: () => automationsService.resume('a-1'), method: 'post', path: '/automations/a-1/resume', body: {} },
    { name: 'duplicate', call: () => automationsService.duplicate('a-1'), method: 'post', path: '/automations/a-1/duplicate', body: {} },
    { name: 'versions', call: () => automationsService.versions('a-1'), method: 'get', path: '/automations/a-1/versions' },
    {
      name: 'runs filtered and paged',
      call: () => automationsService.runs('a-1', { status: 'waiting', limit: 25, offset: 50 }),
      method: 'get',
      path: '/automations/a-1/runs',
      query: { status: 'waiting', limit: '25', offset: '50' },
    },
    { name: 'run', call: () => automationsService.run('run-1'), method: 'get', path: '/automations/runs/run-1' },
    { name: 'cancelRun', call: () => automationsService.cancelRun('run-1'), method: 'post', path: '/automations/runs/run-1/cancel', body: {} },
    { name: 'contactRuns', call: () => automationsService.contactRuns('c-1'), method: 'get', path: '/automations/contact/c-1/runs' },
    {
      name: 'enroll',
      call: () => automationsService.enroll('a-1', ['c-1', 'c-2']),
      method: 'post',
      path: '/automations/a-1/enroll',
      body: { contact_ids: ['c-1', 'c-2'] },
    },
    {
      name: 'audiencePreview',
      call: () => automationsService.audiencePreview({ any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: 'vip' }] }] }),
      method: 'post',
      path: '/automations/audience/preview',
      body: { filter: { any: [{ all: [{ field: 'contact.tags', operator: 'has_tag', value: 'vip' }] }] } },
    },
  ]);

  it('deletes an automation', async () => {
    const calls = mockApi('delete', '/automations/a-1', { status: 204 });
    await automationsService.remove('a-1');
    expect(calls).toHaveLength(1);
  });

  it('surfaces why a publish was refused', async () => {
    const issues = [{ node_key: 's', path: 'config.text', message: 'SMS text is required' }];
    mockApi('post', '/automations/a-1/publish', {
      status: 400,
      message: 'Fix the problems before publishing',
      errors: issues as unknown as Record<string, unknown>,
    });
    await expect(automationsService.publish('a-1')).rejects.toMatchObject({ message: 'Fix the problems before publishing', errors: issues });
  });
});

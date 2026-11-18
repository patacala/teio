import { describe, expect, it } from 'vitest';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { automationService } from './automation.service';

describe('automationService', () => {
  describe('follow-ups', () => {
    itCallsEndpoints([
      {
        name: 'createFollowUp',
        call: () =>
          automationService.createFollowUp({
            contact_id: 'c-1',
            action: 'send_message',
            due_at: '2026-03-16T10:00:00Z',
            channel_strategy: 'last_used',
          }),
        method: 'post',
        path: '/automation/follow-ups',
        body: { contact_id: 'c-1', action: 'send_message', due_at: '2026-03-16T10:00:00Z', channel_strategy: 'last_used' },
      },
      { name: 'listFollowUps without params', call: () => automationService.listFollowUps(), method: 'get', path: '/automation/follow-ups' },
      {
        name: 'listFollowUps with filters',
        call: () => automationService.listFollowUps({ status: 'pending', action: 'call', contact_id: 'c-1', limit: 20, offset: 40 }),
        method: 'get',
        path: '/automation/follow-ups',
        query: { status: 'pending', action: 'call', contact_id: 'c-1', limit: '20', offset: '40' },
      },
      { name: 'getFollowUp', call: () => automationService.getFollowUp('fu-1'), method: 'get', path: '/automation/follow-ups/fu-1' },
      {
        name: 'cancelFollowUp',
        call: () => automationService.cancelFollowUp('fu-1'),
        method: 'patch',
        path: '/automation/follow-ups/fu-1/cancel',
        body: {},
      },
      {
        name: 'listFollowUps for an agenda window',
        call: () => automationService.listFollowUps({ calendar_id: 'cal-fu', from: '2026-03-01', to: '2026-03-31', sort: 'asc', limit: 200 }),
        method: 'get',
        path: '/automation/follow-ups',
        query: { calendar_id: 'cal-fu', from: '2026-03-01', to: '2026-03-31', sort: 'asc', limit: '200' },
      },
      {
        name: 'getFollowUpMetrics',
        call: () => automationService.getFollowUpMetrics('cal-fu'),
        method: 'get',
        path: '/automation/follow-ups/metrics',
        query: { calendar_id: 'cal-fu' },
      },
      {
        name: 'updateFollowUp moves a step',
        call: () => automationService.updateFollowUp('fu-1', { due_at: '2026-03-17T10:00:00Z' }),
        method: 'patch',
        path: '/automation/follow-ups/fu-1',
        body: { due_at: '2026-03-17T10:00:00Z' },
      },
      {
        name: 'completeFollowUp',
        call: () => automationService.completeFollowUp('fu-1'),
        method: 'post',
        path: '/automation/follow-ups/fu-1/complete',
        body: {},
      },
      { name: 'deleteFollowUp', call: () => automationService.deleteFollowUp('fu-1'), method: 'delete', path: '/automation/follow-ups/fu-1' },
      {
        name: 'getContactFollowUps',
        call: () => automationService.getContactFollowUps('c-1'),
        method: 'get',
        path: '/automation/follow-ups/contact/c-1',
      },
      {
        name: 'getContactFollowUps filtered',
        call: () => automationService.getContactFollowUps('c-1', { status: 'completed' }),
        method: 'get',
        path: '/automation/follow-ups/contact/c-1',
        query: { status: 'completed' },
      },
    ]);
  });

  it('returns the steps of a contact', async () => {
    const steps = [{ id: 'fu-1', status: 'pending', run_id: 'run-1' }];
    mockApi('get', '/automation/follow-ups/contact/c-1', { data: steps });

    await expect(automationService.getContactFollowUps('c-1')).resolves.toEqual(steps);
  });
});

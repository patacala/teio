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

  describe('sequences', () => {
    itCallsEndpoints([
      {
        name: 'createSequence pinned to a template',
        call: () => automationService.createSequence({ contact_id: 'c-1', template_id: 'tpl-1', source: 'manual' }),
        method: 'post',
        path: '/automation/sequences',
        body: { contact_id: 'c-1', template_id: 'tpl-1', source: 'manual' },
      },
      { name: 'listSequences without params', call: () => automationService.listSequences(), method: 'get', path: '/automation/sequences' },
      {
        name: 'listSequences with filters',
        call: () => automationService.listSequences({ status: 'active', sequence_type: 'reactivation', limit: 10 }),
        method: 'get',
        path: '/automation/sequences',
        query: { status: 'active', sequence_type: 'reactivation', limit: '10' },
      },
      { name: 'getSequence', call: () => automationService.getSequence('seq-1'), method: 'get', path: '/automation/sequences/seq-1' },
      {
        name: 'cancelSequence',
        call: () => automationService.cancelSequence('seq-1'),
        method: 'patch',
        path: '/automation/sequences/seq-1/cancel',
        body: {},
      },
      {
        name: 'getSequenceSteps',
        call: () => automationService.getSequenceSteps('seq-1'),
        method: 'get',
        path: '/automation/sequences/seq-1/steps',
      },
    ]);
  });

  describe('templates', () => {
    itCallsEndpoints([
      { name: 'listTemplates', call: () => automationService.listTemplates(), method: 'get', path: '/automation/sequences/templates' },
      {
        name: 'getTemplate',
        call: () => automationService.getTemplate('tpl-1'),
        method: 'get',
        path: '/automation/sequences/templates/tpl-1',
      },
      {
        name: 'duplicateTemplate with a new name',
        call: () => automationService.duplicateTemplate('tpl-1', 'My follow-up'),
        method: 'post',
        path: '/automation/sequences/templates/tpl-1/duplicate',
        body: { name: 'My follow-up' },
      },
      {
        name: 'duplicateTemplate keeping the server default name',
        call: () => automationService.duplicateTemplate('tpl-1'),
        method: 'post',
        path: '/automation/sequences/templates/tpl-1/duplicate',
        body: {},
      },
      {
        name: 'updateTemplate',
        call: () => automationService.updateTemplate('tpl-1', { is_active: false }),
        method: 'patch',
        path: '/automation/sequences/templates/tpl-1',
        body: { is_active: false },
      },
      {
        name: 'replaceTemplateSteps sends the ordered steps',
        call: () =>
          automationService.replaceTemplateSteps('tpl-1', [
            { action: 'send_message', channel_strategy: 'last_used', delay_hours: 0 },
            { action: 'call', channel_strategy: 'voice', delay_hours: 24 },
          ]),
        method: 'put',
        path: '/automation/sequences/templates/tpl-1/steps',
        body: {
          steps: [
            { action: 'send_message', channel_strategy: 'last_used', delay_hours: 0 },
            { action: 'call', channel_strategy: 'voice', delay_hours: 24 },
          ],
        },
      },
      {
        name: 'deleteTemplate',
        call: () => automationService.deleteTemplate('tpl-1'),
        method: 'delete',
        path: '/automation/sequences/templates/tpl-1',
      },
    ]);
  });

  it('returns the list and total of sequences', async () => {
    const list = { items: [{ id: 'seq-1', status: 'active' }], total: 1 };
    mockApi('get', '/automation/sequences', { data: list });

    await expect(automationService.listSequences()).resolves.toEqual(list);
  });

  it('rejects when a platform template cannot be edited', async () => {
    mockApi('patch', '/automation/sequences/templates/tpl-1', { status: 403, message: 'Platform templates are read-only' });

    await expect(automationService.updateTemplate('tpl-1', { name: 'x' })).rejects.toThrow('Platform templates are read-only');
  });
});

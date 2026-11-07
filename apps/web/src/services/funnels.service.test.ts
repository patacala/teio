import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { funnelsService } from './funnels.service';

describe('funnelsService', () => {
  itCallsEndpoints([
    { name: 'getFunnels', call: () => funnelsService.getFunnels(), method: 'get', path: '/funnels' },
    {
      name: 'createFunnel',
      call: () => funnelsService.createFunnel({ name: 'Sales' }),
      method: 'post',
      path: '/funnels',
      body: { name: 'Sales' },
    },
    { name: 'getFunnelStages', call: () => funnelsService.getFunnelStages('f-1'), method: 'get', path: '/funnels/f-1/stages' },
    {
      name: 'createFunnelStage with automation semantics',
      call: () =>
        funnelsService.createFunnelStage('f-1', { name: 'Won', stage_type: 'won', is_terminal: true, position: 7 }),
      method: 'post',
      path: '/funnels/f-1/stages',
      body: { name: 'Won', stage_type: 'won', is_terminal: true, position: 7 },
    },
    {
      name: 'updateFunnelStage',
      call: () => funnelsService.updateFunnelStage('f-1', 's-1', { rotting_days: 14 }),
      method: 'patch',
      path: '/funnels/f-1/stages/s-1',
      body: { rotting_days: 14 },
    },
    {
      name: 'deleteFunnelStage',
      call: () => funnelsService.deleteFunnelStage('f-1', 's-1'),
      method: 'delete',
      path: '/funnels/f-1/stages/s-1',
    },
    {
      name: 'reorderFunnelStages sends the ordered ids',
      call: () => funnelsService.reorderFunnelStages('f-1', ['s-3', 's-1', 's-2']),
      method: 'post',
      path: '/funnels/f-1/stages/reorder',
      body: { orderedIds: ['s-3', 's-1', 's-2'] },
    },
    { name: 'getFunnelTemplates', call: () => funnelsService.getFunnelTemplates(), method: 'get', path: '/funnels/templates' },
    {
      name: 'applyFunnelTemplate maps to template_id',
      call: () => funnelsService.applyFunnelTemplate('tpl-1'),
      method: 'post',
      path: '/funnels/templates/apply',
      body: { template_id: 'tpl-1' },
    },
    {
      name: 'updateContactStage maps to stage_id',
      call: () => funnelsService.updateContactStage('contact-1', 's-2'),
      method: 'patch',
      path: '/contacts/contact-1/stage',
      body: { stage_id: 's-2' },
    },
    { name: 'getAllStages', call: () => funnelsService.getAllStages(), method: 'get', path: '/funnels/stages' },
  ]);
});

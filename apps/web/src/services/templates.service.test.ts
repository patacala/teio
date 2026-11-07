import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { templatesService } from './templates.service';

describe('templatesService', () => {
  itCallsEndpoints([
    { name: 'getTemplates without a channel', call: () => templatesService.getTemplates(), method: 'get', path: '/templates' },
    {
      name: 'getTemplates filtered by channel',
      call: () => templatesService.getTemplates('whatsapp'),
      method: 'get',
      path: '/templates',
      query: { channel: 'whatsapp' },
    },
    {
      name: 'createTemplate',
      call: () => templatesService.createTemplate({ name: 'Welcome', content: 'Hi {{name}}', variables: ['name'] }),
      method: 'post',
      path: '/templates',
      body: { name: 'Welcome', content: 'Hi {{name}}', variables: ['name'] },
    },
    {
      name: 'updateTemplate',
      call: () => templatesService.updateTemplate('tpl-1', { content: 'Hello' }),
      method: 'patch',
      path: '/templates/tpl-1',
      body: { content: 'Hello' },
    },
    { name: 'deleteTemplate', call: () => templatesService.deleteTemplate('tpl-1'), method: 'delete', path: '/templates/tpl-1' },
  ]);
});

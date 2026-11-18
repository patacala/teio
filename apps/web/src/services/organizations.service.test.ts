import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { organizationsService } from './organizations.service';

describe('organizationsService', () => {
  itCallsEndpoints([
    { name: 'listAll', call: () => organizationsService.listAll(), method: 'get', path: '/organizations' },
    { name: 'getMyOrganization', call: () => organizationsService.getMyOrganization(), method: 'get', path: '/organizations/me' },
    {
      name: 'setInternal',
      call: () => organizationsService.setInternal('0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a10', true),
      method: 'patch',
      path: '/organizations/0e6f2f3c-1c58-4c4f-9b2a-3d7c2b8f9a10',
      body: { is_internal: true },
    },
  ]);
});

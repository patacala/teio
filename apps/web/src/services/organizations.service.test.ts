import { describe } from 'vitest';
import { itCallsEndpoints } from '@/test/msw/api';
import { organizationsService } from './organizations.service';

describe('organizationsService', () => {
  itCallsEndpoints([
    { name: 'listAll', call: () => organizationsService.listAll(), method: 'get', path: '/organizations' },
    { name: 'getMyOrganization', call: () => organizationsService.getMyOrganization(), method: 'get', path: '/organizations/me' },
    {
      name: 'updateMyBranding',
      call: () => organizationsService.updateMyBranding({ primary_color: '#c8f169' }),
      method: 'patch',
      path: '/organizations/me/branding',
      body: { primary_color: '#c8f169' },
    },
    {
      name: 'updateMyNotificationPreferences wraps the preferences',
      call: () =>
        organizationsService.updateMyNotificationPreferences({ 'appointment.created': { enabled: true } }),
      method: 'patch',
      path: '/organizations/me/notifications',
      body: { preferences: { 'appointment.created': { enabled: true } } },
    },
    {
      name: 'updateSequenceSettings',
      call: () => organizationsService.updateSequenceSettings(false),
      method: 'patch',
      path: '/organizations/me/sequences',
      body: { enabled: false },
    },
  ]);
});

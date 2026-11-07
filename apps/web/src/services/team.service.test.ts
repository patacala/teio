import { describe, expect, it } from 'vitest';
import { UserRole } from '@crm/shared';
import { itCallsEndpoints, mockApi } from '@/test/msw/api';
import { teamService } from './team.service';

describe('teamService', () => {
  itCallsEndpoints([
    { name: 'getMembers', call: () => teamService.getMembers(), method: 'get', path: '/users' },
    { name: 'getCurrentUser', call: () => teamService.getCurrentUser(), method: 'get', path: '/users/me' },
    {
      name: 'updateMember',
      call: () => teamService.updateMember('user-1', { role: UserRole.AGENT, is_active: false }),
      method: 'patch',
      path: '/users/user-1',
      body: { role: UserRole.AGENT, is_active: false },
    },
    {
      name: 'inviteMember',
      call: () => teamService.inviteMember({ email: 'ana@acme.test', role: UserRole.AGENT }),
      method: 'post',
      path: '/users/invite',
      body: { email: 'ana@acme.test', role: UserRole.AGENT },
    },
    {
      name: 'acceptInvite',
      call: () => teamService.acceptInvite({ full_name: 'Ana Pérez' }),
      method: 'post',
      path: '/users/invite/accept',
      body: { full_name: 'Ana Pérez' },
    },
  ]);

  it('surfaces the API message when an invite is rejected', async () => {
    mockApi('post', '/users/invite', { status: 409, message: 'User already belongs to an organization' });

    await expect(teamService.inviteMember({ email: 'ana@acme.test', role: UserRole.AGENT })).rejects.toThrow(
      'User already belongs to an organization',
    );
  });
});

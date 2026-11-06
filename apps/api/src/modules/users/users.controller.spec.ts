/// <reference types="jest" />
import { Reflector } from '@nestjs/core';
import { UserRole } from '@crm/shared';
import { UsersController } from './users.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';

const rolesFor = (method: keyof UsersController) =>
  new Reflector().get<UserRole[] | undefined>(ROLES_KEY, UsersController.prototype[method]);

describe('UsersController role requirements', () => {
  it.each(['invite', 'create', 'update'] as const)('%s is admin-only', (method) => {
    expect(rolesFor(method)).toEqual([UserRole.ADMIN]);
  });

  it('acceptInvite is open to every human role but not to API keys', () => {
    expect(rolesFor('acceptInvite')).toEqual(Object.values(UserRole));
    expect(rolesFor('acceptInvite')).not.toContain('api_key');
  });

  it.each(['getMe', 'findAll', 'findOne'] as const)('%s has no role restriction', (method) => {
    expect(rolesFor(method)).toBeUndefined();
  });
});

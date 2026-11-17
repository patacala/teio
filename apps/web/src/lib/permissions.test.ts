import { describe, expect, it } from 'vitest';
import { permissionsFor } from './permissions';

describe('permissionsFor', () => {
  it.each(['owner', 'admin'])('gives an org %s full configuration access', (role) => {
    expect(permissionsFor({ role })).toEqual({
      isAdmin: true,
      canManageConfiguration: true,
      canAccessAdmin: true,
      canResolvePaymentAttention: true,
      canOverrideCalendarRules: true,
    });
  });

  it('lets an agent run the day-to-day but not change configuration', () => {
    expect(permissionsFor({ role: 'agent' })).toEqual({
      isAdmin: false,
      canManageConfiguration: false,
      canAccessAdmin: false,
      canResolvePaymentAttention: true,
      canOverrideCalendarRules: false,
    });
  });

  it('lets a platform admin into the admin area, but configuration follows the org role (like the API)', () => {
    const p = permissionsFor({ role: 'agent', is_platform_admin: true });
    expect(p.isAdmin).toBe(true);
    expect(p.canAccessAdmin).toBe(true);
    expect(p.canManageConfiguration).toBe(false);
    expect(p.canOverrideCalendarRules).toBe(false);
    expect(permissionsFor({ role: 'owner', is_platform_admin: true }).canManageConfiguration).toBe(true);
  });

  it('grants nothing while the user is unknown or a viewer', () => {
    for (const user of [undefined, null, {}, { role: 'viewer' }]) {
      const p = permissionsFor(user);
      expect(Object.values(p).every((v) => v === false)).toBe(true);
    }
  });
});

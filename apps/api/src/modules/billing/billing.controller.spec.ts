/// <reference types="jest" />
import { Reflector } from '@nestjs/core';
import { UserRole } from '@crm/shared';
import { BillingController } from './billing.controller';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { IS_PLATFORM_ADMIN_KEY } from '../../common/decorators/platform-admin.decorator';
import { SKIP_BILLING_CHECK_KEY } from './billing-access.decorators';
import { OrganizationsController } from '../organizations/organizations.controller';

const reflector = new Reflector();
const meta = (key: string, method: keyof BillingController) =>
  reflector.get(key, BillingController.prototype[method]);

describe('BillingController authorization', () => {
  it.each([
    'getSubscription',
    'getUsage',
    'listInvoices',
    'createCustomer',
    'startCheckout',
    'changePlan',
    'createPaymentMethodSession',
    'portal',
    'cancel',
    'resume',
  ] as const)('%s is restricted to owners and admins', (method) => {
    expect(meta(ROLES_KEY, method)).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    expect(meta(IS_PUBLIC_KEY, method)).toBeUndefined();
  });

  it('status is readable by every member so restrictions can be shown', () => {
    expect(meta(ROLES_KEY, 'getStatus')).toBeUndefined();
    expect(meta(IS_PUBLIC_KEY, 'getStatus')).toBeUndefined();
  });

  it.each(['getPlans', 'stripeWebhook'] as const)('%s is public and has no role gate', (method) => {
    expect(meta(IS_PUBLIC_KEY, method)).toBe(true);
    expect(meta(ROLES_KEY, method)).toBeUndefined();
  });

  it('keeps every billing route reachable while the org is restricted', () => {
    expect(reflector.get(SKIP_BILLING_CHECK_KEY, BillingController)).toBe(true);
  });
});

describe('OrganizationsController authorization', () => {
  it.each(['create', 'update', 'findAll'] as const)('%s is platform-admin only', (method) => {
    expect(reflector.get(IS_PLATFORM_ADMIN_KEY, OrganizationsController.prototype[method])).toBe(true);
  });
});

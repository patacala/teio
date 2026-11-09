'use client';

import { usePathname, useRouter } from 'next/navigation';
import { CreditCard, ShieldAlert } from 'lucide-react';
import { BillingAccessLevel, BillingRestrictionReason, UserRole } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { useBillingStatus } from '@/hooks/useBilling';
import { useCurrentUser } from '@/hooks/useTeam';
import { isRestricted, primaryRestrictionMessage } from './billing-labels';

export const BILLING_PATH = '/admin/billing';
const BILLING_MANAGER_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN];

/**
 * Replaces the page with a single explanation when the organization's access
 * is blocked or suspended (every product API call would fail with 402/403).
 * Owners and admins can still reach the billing page to pay.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useCurrentUser();
  const status = useBillingStatus(!!user.data);
  const currentUser = user.data;
  const access = status.data;

  // Wait until we know whether the org may use the app, so a blocked org never
  // sees (and requests) the page it cannot use. Errors fall through to the page.
  const waiting = !user.isError && (!currentUser || (status.isPending && !status.isError));
  if (waiting) {
    return (
      <div className="flex h-64 items-center justify-center" aria-busy="true" aria-label="Loading">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/50 border-t-transparent" />
      </div>
    );
  }

  if (!access || !currentUser || currentUser.is_platform_admin || !isRestricted(access)) {
    return <>{children}</>;
  }

  const canManage = BILLING_MANAGER_ROLES.includes(currentUser.role);
  if (canManage && pathname.startsWith(BILLING_PATH)) return <>{children}</>;

  const suspended = access.level === BillingAccessLevel.SUSPENDED;
  const demoEnded = access.reasons.includes(BillingRestrictionReason.DEMO_EXPIRED);
  const Icon = suspended ? ShieldAlert : CreditCard;
  const title = suspended ? 'Organization suspended' : demoEnded ? 'Your demo has ended' : 'Payment required';
  const message = suspended
    ? 'This organization has been deactivated. Contact support to reactivate it.'
    : demoEnded
      ? canManage
        ? 'Choose a plan to keep using the CRM.'
        : 'Ask an owner or admin of your organization to choose a plan.'
      : primaryRestrictionMessage(access);
  const memberHint = !canManage && !suspended && !demoEnded
    ? 'Ask an owner or admin of your organization to complete the payment.'
    : null;

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div role="alert" className="panel-card flex max-w-md flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-danger/25 bg-danger/10">
          <Icon className="h-6 w-6 text-danger" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <p className="text-sm text-secondary">{message}</p>
          {memberHint && <p className="text-xs text-muted">{memberHint}</p>}
        </div>
        {canManage && (
          <Button onClick={() => router.push(BILLING_PATH)}>
            {suspended ? 'View billing' : demoEnded ? 'Choose a plan' : 'Go to billing'}
          </Button>
        )}
      </div>
    </div>
  );
}

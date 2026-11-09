'use client';

import { UserRole } from '@crm/shared';
import { useImpersonation } from '@/contexts/impersonation-context';
import { useCurrentUser } from '@/hooks/useTeam';

const BILLING_MANAGER_ROLES: string[] = [UserRole.OWNER, UserRole.ADMIN];

/** Who is looking at the organization's billing state, and what they may do about it. */
export function useBillingViewer() {
  const { data: currentUser } = useCurrentUser();
  const { isImpersonating } = useImpersonation();
  const isPlatformAdmin = currentUser?.is_platform_admin === true;
  return {
    currentUser,
    /** A platform admin operating the platform: org billing notices do not apply to them. */
    platformMode: isPlatformAdmin && !isImpersonating,
    canManage: !!currentUser && (isPlatformAdmin || BILLING_MANAGER_ROLES.includes(currentUser.role)),
  };
}

'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useImpersonation } from '@/contexts/impersonation-context';

/** Enters an organization as the platform admin (impersonation) and opens one of its pages. */
export function useOpenOrganization() {
  const router = useRouter();
  const { startImpersonating } = useImpersonation();
  return useCallback(
    (organization: { id: string; name: string }, path = '/') => {
      startImpersonating(organization.id, organization.name);
      router.push(path);
    },
    [router, startImpersonating],
  );
}

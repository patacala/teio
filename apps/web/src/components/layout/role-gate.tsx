'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/useToast';
import type { Permissions } from '@/lib/permissions';

interface RoleGateProps {
  /** Which permission opens this area. */
  allow: (permissions: Permissions) => boolean;
  /** Where to send users who can't open it. */
  redirectTo?: string;
  /** Shown once when a signed-in user is sent away (not on load errors). */
  deniedMessage?: string;
  children: React.ReactNode;
}

/**
 * Page-level role guard. The API enforces the same rules; this only avoids
 * showing screens whose actions would all fail.
 */
export function RoleGate({ allow, redirectTo = '/', deniedMessage, children }: RoleGateProps) {
  const permissions = usePermissions();
  const router = useRouter();
  const notified = useRef(false);
  const hasAccess = allow(permissions);
  const decided = !permissions.isLoading;

  useEffect(() => {
    if (!decided || hasAccess) return;
    if (deniedMessage && !permissions.isError && !notified.current) {
      notified.current = true;
      toast({ title: deniedMessage, variant: 'warning' });
    }
    router.replace(redirectTo);
  }, [decided, hasAccess, deniedMessage, permissions.isError, redirectTo, router]);

  if (!decided) {
    return (
      <div className="flex h-64 items-center justify-center" role="status" aria-label="Loading">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/50 border-t-transparent" />
      </div>
    );
  }

  if (!hasAccess) return null;
  return <>{children}</>;
}

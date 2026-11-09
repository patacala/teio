'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useTeam';

/** Platform administration: only platform admins, never organization roles. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useCurrentUser();
  const router = useRouter();
  const hasAccess = user?.is_platform_admin === true;

  useEffect(() => {
    if (!isLoading && (isError || (user && !hasAccess))) router.replace('/');
  }, [user, isLoading, isError, hasAccess, router]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent/50 border-t-transparent" />
      </div>
    );
  }

  if (!hasAccess) return null;
  return <>{children}</>;
}

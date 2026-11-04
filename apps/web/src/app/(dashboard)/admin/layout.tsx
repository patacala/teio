'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useTeam';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useCurrentUser();
  const router = useRouter();

  const hasAccess = user && (user.role === 'admin' || user.is_platform_admin === true);

  useEffect(() => {
    if (!isLoading && (isError || (user && !hasAccess))) {
      router.replace('/');
    }
  }, [user, isLoading, isError, hasAccess, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 rounded-full border-2 border-accent/50 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return <>{children}</>;
}

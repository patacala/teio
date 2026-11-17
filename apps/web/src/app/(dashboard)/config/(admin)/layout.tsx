'use client';

import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/role-gate';

/**
 * AI agent, channels, webhooks and payment setup (Stripe + prices) are
 * owner/admin only — the API rejects every write from other roles. Agents who
 * land on payment setup (old links, bookmarks) go to the operational Payments
 * page, where they do have work to do.
 */
export default function AdminConfigLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const redirectTo = pathname.startsWith('/config/payments') ? '/payments' : '/';
  return (
    <RoleGate
      allow={(p) => p.canManageConfiguration}
      redirectTo={redirectTo}
      deniedMessage="Only admins can change this configuration"
    >
      {children}
    </RoleGate>
  );
}

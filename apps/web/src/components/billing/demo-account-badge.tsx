'use client';

import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useBillingStatus } from '@/hooks/useBilling';
import { BILLING_PATH } from './billing-gate';
import { useBillingViewer } from './use-billing-viewer';
import { demoTimeLeft } from './billing-labels';

export function DemoAccountBadge() {
  const router = useRouter();
  const { currentUser, platformMode, canManage } = useBillingViewer();
  const { data: access } = useBillingStatus(!!currentUser);

  if (!access?.is_demo || platformMode) return null;

  const timeLeft = access.demo_ends_at ? demoTimeLeft(access.demo_ends_at) : null;
  const label = timeLeft ? `Demo account · ${timeLeft}` : 'Demo account';
  const badge = (
    <Badge variant={timeLeft && access.reasons.length > 0 ? 'warning' : 'info'} className="normal-case">
      <Sparkles className="h-3 w-3" />
      {label}
    </Badge>
  );

  if (!canManage) return badge;

  return (
    <button
      type="button"
      onClick={() => router.push(BILLING_PATH)}
      aria-label={`${label}: choose a plan`}
      className="rounded-full transition-opacity hover:opacity-80"
    >
      {badge}
    </button>
  );
}

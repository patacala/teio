'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBillingStatus } from '@/hooks/useBilling';
import { BillingRestrictionReason } from '@crm/shared';
import { formatDemoEnd, needsAttention, primaryRestrictionMessage } from './billing-labels';
import { BILLING_PATH } from './billing-gate';
import { useBillingViewer } from './use-billing-viewer';

/** Warning while access still works but will be lost (e.g. failed payment in its grace period). */
export function BillingStatusBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, platformMode, canManage } = useBillingViewer();
  const { data: access } = useBillingStatus(!!currentUser);

  if (!access || platformMode || !needsAttention(access) || pathname.startsWith(BILLING_PATH)) return null;

  const demoEnding = access.reasons.includes(BillingRestrictionReason.DEMO_ENDING_SOON) && !!access.demo_ends_at;
  const graceEnds = access.grace_period_ends_at
    ? new Date(access.grace_period_ends_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      role="alert"
      className="flex shrink-0 flex-col gap-2 rounded-panel border border-warning/25 bg-warning/10 px-4 py-2.5 text-xs text-warning sm:flex-row sm:items-center"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <p className="flex-1 font-medium">
        {primaryRestrictionMessage(access)}
        {graceEnds && <span className="font-normal"> Access will be blocked on {graceEnds} if no payment is received.</span>}
        {demoEnding && <span className="font-normal"> It ends on {formatDemoEnd(access.demo_ends_at!)}.</span>}
        {!canManage && <span className="font-normal"> Ask an organization admin to review billing.</span>}
      </p>
      {canManage && (
        <Button size="sm" variant="secondary" onClick={() => router.push(BILLING_PATH)}>
          {demoEnding ? 'Choose a plan' : 'Review billing'}
        </Button>
      )}
    </div>
  );
}

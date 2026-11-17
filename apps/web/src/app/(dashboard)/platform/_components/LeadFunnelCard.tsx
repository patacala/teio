'use client';

import { Filter, UserPlus } from 'lucide-react';
import type { PlatformOverview } from '@crm/shared';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FunnelPipeline } from '@/components/dashboard/funnel-pipeline';
import { SectionHeader } from '@/components/dashboard/section-header';
import { LEAD_FUNNEL_LABELS } from './platform-labels';

/** Demo form leads from the first click to the first payment, plus direct signups. */
export function LeadFunnelCard({ overview, loading }: { overview: PlatformOverview | undefined; loading: boolean }) {
  const unavailable = !loading && !overview;
  const steps = (overview?.lead_funnel ?? []).map((step) => ({
    key: step.key,
    label: LEAD_FUNNEL_LABELS[step.key],
    count: step.count,
  }));
  const signups = overview?.signups;

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <SectionHeader
        icon={<Filter className="h-4 w-4" />}
        title="Lead funnel"
        subtitle="Demo requests of this period, followed to payment"
      />
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        {loading ? (
          <Skeleton className="h-[340px] w-full rounded-row" />
        ) : unavailable ? (
          <p className="py-12 text-center text-sm text-muted">The funnel is unavailable right now</p>
        ) : steps.every((step) => step.count === 0) ? (
          <p className="py-12 text-center text-sm text-muted">No demo requests in this period</p>
        ) : (
          <FunnelPipeline steps={steps} unit="leads" layout="bars" />
        )}
        {signups && !loading && (
          <div className="mt-auto flex items-center gap-3 rounded-row border border-white/6 bg-surface-raised px-4 py-3">
            <UserPlus className="h-4 w-4 shrink-0 text-accent" />
            <p className="text-xs text-secondary">
              <span className="font-medium text-primary">{signups.signups} direct signups</span>
              {' · '}{signups.activated} set up a channel{' · '}{signups.paid} paid
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import type { PlatformRange } from '@crm/shared';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CustomRangePicker, RangeSelector, type CustomDateRange } from '@/components/dashboard/range-picker';
import { usePlatformOverview } from '@/hooks/usePlatformAnalytics';
import { AttentionPanel } from './_components/AttentionPanel';
import { LatestLeadsCard } from './_components/LatestLeadsCard';
import { LeadFunnelCard } from './_components/LeadFunnelCard';
import { OrganizationsCard } from './_components/OrganizationsCard';
import { PlatformKpiStrip } from './_components/PlatformKpiStrip';
import { RevenueChartCard } from './_components/RevenueChartCard';

/**
 * Super admin dashboard: what the platform earns, what it may lose, where the
 * next customers come from, and what needs action now. Internal organizations
 * are left out of every figure.
 */
export default function PlatformOverviewPage() {
  const [range, setRange] = useState<PlatformRange>('30d');
  const [custom, setCustom] = useState<CustomDateRange | null>(null);
  const { data: overview, isLoading, isError, refetch } = usePlatformOverview(range, custom);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-primary">Platform overview</h1>
            <p className="mt-0.5 text-xs text-muted">
              Money, leads and organizations across the platform · internal organizations excluded
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RangeSelector value={range} isCustom={!!custom} onChange={(r) => { setRange(r); setCustom(null); }} />
            <CustomRangePicker active={custom} onApply={setCustom} onClear={() => setCustom(null)} />
          </div>
        </div>

        {isError && (
          <div role="alert" className="flex items-center justify-between gap-3 rounded-row border border-danger/20 bg-danger/10 px-4 py-3">
            <p className="text-sm text-danger">Could not load the platform figures.</p>
            <Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>
          </div>
        )}

        <PlatformKpiStrip overview={overview} loading={isLoading} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <AttentionPanel />
          <LeadFunnelCard overview={overview} loading={isLoading} />
        </div>

        <RevenueChartCard months={overview?.revenue_by_month} loading={isLoading} />
        <LatestLeadsCard />
        <OrganizationsCard />
      </div>
    </TooltipProvider>
  );
}

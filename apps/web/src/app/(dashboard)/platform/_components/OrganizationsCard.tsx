'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, MoreHorizontal, Search } from 'lucide-react';
import { BillingRestrictionReason, PLATFORM_ORGANIZATION_SORTS } from '@crm/shared';
import type { PlatformOrganizationFilter, PlatformOrganizationRow, PlatformOrganizationSort } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { demoTimeLeft } from '@/components/billing/billing-labels';
import { formatMoney } from '@/components/dashboard/format';
import { SegmentedControl } from '@/components/dashboard/segmented-control';
import { TableCard } from '@/components/dashboard/table-card';
import { usePlatformOrganizations, useSetOrganizationInternal } from '@/hooks/usePlatformAnalytics';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import {
  METRIC_LABELS,
  ORGANIZATION_FILTER_LABELS,
  ORGANIZATION_FILTER_ORDER,
  ORGANIZATION_SORT_LABELS,
  ORGANIZATION_STATE_META,
  demoAccountsHref,
  formatDay,
  planLabel,
  pluralize,
  timeAgo,
} from './platform-labels';
import { useDebouncedSearch } from './use-debounced-search';
import { useOpenOrganization } from './use-open-organization';

const PAGE_SIZE = 10;
const TH = 'px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary';

function StateCell({ org }: { org: PlatformOrganizationRow }) {
  const state = ORGANIZATION_STATE_META[org.state];
  const notes = [
    org.subscription_status === 'past_due' && org.state === 'paying' ? 'Past due' : null,
    org.reasons.includes(BillingRestrictionReason.CANCELLATION_SCHEDULED) ? 'Cancelling' : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge variant={state.variant} className="whitespace-nowrap">{state.label}</Badge>
      {notes.map((note) => <Badge key={note} variant="warning" className="whitespace-nowrap">{note}</Badge>)}
      {org.is_internal && <Badge variant="outline" className="whitespace-nowrap">Internal</Badge>}
    </div>
  );
}

function PlanCell({ org }: { org: PlatformOrganizationRow }) {
  const isDemoPlan = org.state === 'demo' || org.state === 'demo_expired';
  return (
    <div className="whitespace-nowrap">
      <p className="text-[12px] text-primary">{isDemoPlan ? 'Demo' : planLabel(org.plan_name)}</p>
      {org.mrr > 0 && (
        <p className="text-[11px] text-muted">
          {formatMoney(org.mrr)}/mo{org.billing_period === 'yearly' ? ' · yearly' : ''}
        </p>
      )}
    </div>
  );
}

function DateCell({ org }: { org: PlatformOrganizationRow }) {
  if (org.state === 'demo') {
    if (!org.demo_ends_at) return <span className="whitespace-nowrap text-[12px] text-secondary">No end date</span>;
    const left = demoTimeLeft(org.demo_ends_at);
    const soon = new Date(org.demo_ends_at).getTime() - Date.now() <= 3 * 24 * 60 * 60 * 1000;
    return (
      <div className="whitespace-nowrap">
        <p className="text-[12px] text-primary">Ends {formatDay(org.demo_ends_at)}</p>
        <p className={cn('text-[11px]', soon ? 'text-warning' : 'text-muted')}>{left}</p>
      </div>
    );
  }
  if (org.state === 'demo_expired' && org.demo_ends_at) {
    return <span className="whitespace-nowrap text-[12px] text-danger">Ended {formatDay(org.demo_ends_at)}</span>;
  }
  if ((org.state === 'paying' || org.state === 'payment_failed') && org.renews_at) {
    return <span className="whitespace-nowrap text-[12px] text-secondary">Renews {formatDay(org.renews_at)}</span>;
  }
  return <span className="text-[12px] text-muted">—</span>;
}

function UsageCell({ org }: { org: PlatformOrganizationRow }) {
  const peak = org.usage_peak;
  if (!peak) return <span className="text-[12px] text-muted">—</span>;
  const tone = peak.percent >= 100 ? 'text-danger' : peak.percent >= 80 ? 'text-warning' : 'text-secondary';
  return (
    <span
      className={cn('whitespace-nowrap text-[12px] tabular-nums', tone)}
      aria-label={`${peak.percent}% of ${METRIC_LABELS[peak.metric]} used: ${peak.used} of ${peak.limit}`}
    >
      {peak.percent}% <span className="text-muted">{METRIC_LABELS[peak.metric]}</span>
    </span>
  );
}

function RowActions({ org }: { org: PlatformOrganizationRow }) {
  const router = useRouter();
  const openOrganization = useOpenOrganization();
  const setInternal = useSetOrganizationInternal();
  const isDemo = org.state === 'demo' || org.state === 'demo_expired';

  const toggleInternal = () =>
    setInternal.mutate(
      { organizationId: org.id, isInternal: !org.is_internal },
      {
        onSuccess: () =>
          toast({
            title: org.is_internal ? `${org.name} counts in platform metrics again` : `${org.name} marked as internal`,
          }),
        onError: (err) => toast({ title: err.message, variant: 'error' }),
      },
    );

  return (
    <div className="flex items-center justify-end gap-1">
      <Button size="sm" variant="secondary" onClick={() => openOrganization(org)} aria-label={`Open ${org.name}`}>
        Open
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`More actions for ${org.name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => openOrganization(org, '/admin/billing')}>Open billing</DropdownMenuItem>
          {isDemo && <DropdownMenuItem onSelect={() => router.push(demoAccountsHref(org.slug))}>Manage demo</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={toggleInternal} disabled={setInternal.isPending}>
            {org.is_internal ? 'Count in platform metrics' : 'Mark as internal'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Every organization with what it pays, where it stands and how much it uses the product. */
export function OrganizationsCard() {
  const [filter, setFilter] = useState<PlatformOrganizationFilter>('all');
  const [sort, setSort] = useState<PlatformOrganizationSort>('mrr');
  const [page, setPage] = useState(1);
  const { input, setInput, search } = useDebouncedSearch(() => setPage(1));
  const { data, isLoading, isError, refetch } = usePlatformOrganizations({ filter, sort, search, page, limit: PAGE_SIZE });

  const options = ORGANIZATION_FILTER_ORDER.map((value) => ({
    value,
    label: ORGANIZATION_FILTER_LABELS[value],
    count: data?.counts[value],
  }));

  return (
    <TableCard
      icon={<Building2 />}
      title="Organizations"
      subtitle="State, revenue, usage this month and activity"
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search name, slug or owner…"
              aria-label="Search organizations"
              className="h-9 pl-8"
            />
          </div>
          <Select value={sort} onValueChange={(value) => { setSort(value as PlatformOrganizationSort); setPage(1); }}>
            <SelectTrigger className="h-9 sm:w-48" aria-label="Sort organizations">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PLATFORM_ORGANIZATION_SORTS.map((value) => (
                <SelectItem key={value} value={value}>{ORGANIZATION_SORT_LABELS[value]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
      filters={
        <SegmentedControl
          label="Organization state"
          options={options}
          value={filter}
          onChange={(value) => { setFilter(value); setPage(1); }}
        />
      }
      isLoading={isLoading}
      isError={isError}
      errorText="Could not load organizations."
      onRetry={() => refetch()}
      isEmpty={!data?.items.length}
      empty={
        search
          ? { title: `No organizations match “${search}”`, hint: 'Try another name, slug or owner email.' }
          : { title: `No organizations in “${ORGANIZATION_FILTER_LABELS[filter]}”` }
      }
      footer={data && <TablePagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onPageChange={setPage} label="organizations" />}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-subtle bg-surface-raised/60">
            <th className={cn(TH, 'pl-5')}>Organization</th>
            <th className={TH}>State</th>
            <th className={TH}>Plan</th>
            <th className={TH}>Renewal / demo</th>
            <th className={TH}>Peak usage</th>
            <th className={TH}>Team</th>
            <th className={TH}>Last active</th>
            <th className={cn(TH, 'text-right')}>Lifetime</th>
            <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle/60">
          {data?.items.map((org) => (
            <tr key={org.id} className="transition-colors hover:bg-olive-dark/30">
              <td className="px-5 py-3">
                <p className="max-w-[220px] truncate text-[13px] font-medium text-primary">{org.name}</p>
                <p className="max-w-[220px] truncate text-[11px] text-muted">{org.owner_email ?? org.slug}</p>
              </td>
              <td className="px-3 py-3"><StateCell org={org} /></td>
              <td className="px-3 py-3"><PlanCell org={org} /></td>
              <td className="px-3 py-3"><DateCell org={org} /></td>
              <td className="px-3 py-3"><UsageCell org={org} /></td>
              <td className="px-3 py-3">
                <p className="whitespace-nowrap text-[12px] text-secondary">{pluralize(org.members, 'member')}</p>
                <p className={cn('whitespace-nowrap text-[11px]', org.channels ? 'text-muted' : 'text-warning')}>
                  {org.channels ? pluralize(org.channels, 'channel') : 'No channel'}
                </p>
              </td>
              <td className="px-3 py-3">
                <span className="whitespace-nowrap text-[12px] text-secondary">
                  {org.last_activity_at ? timeAgo(org.last_activity_at) : 'Never'}
                </span>
              </td>
              <td className="px-3 py-3 text-right">
                <span className="whitespace-nowrap text-[12px] tabular-nums text-primary">{formatMoney(org.lifetime_revenue)}</span>
              </td>
              <td className="px-5 py-3"><RowActions org={org} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import type { DemoOrganization, PlanLimits } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/ui/table-pagination';
import { useDemoDefaults, useDemoOrganizations } from '@/hooks/usePlatformBilling';
import { cn } from '@/lib/utils';
import { demoTimeLeft } from '@/components/billing/billing-labels';
import { EditDemoLimitsDialog } from './EditDemoLimitsDialog';
import { LIMIT_METRICS } from './limit-metrics';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const ENDING_SOON_MS = 3 * 24 * 60 * 60 * 1000;

function DemoEndCell({ endsAt }: { endsAt: string | null }) {
  if (!endsAt) return <span className="whitespace-nowrap text-[12px] text-secondary">No end date</span>;
  const remaining = new Date(endsAt).getTime() - Date.now();
  const tone = remaining <= 0 ? 'text-danger' : remaining <= ENDING_SOON_MS ? 'text-warning' : 'text-muted';
  return (
    <div className="whitespace-nowrap">
      <p className="text-[12px] text-primary">
        {new Date(endsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <p className={cn('text-[11px]', tone)}>{demoTimeLeft(endsAt)}</p>
    </div>
  );
}

function UsageCell({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : limit === 0 && used > 0 ? 1 : 0;
  const tone = limit === -1 ? 'text-secondary' : ratio >= 1 ? 'text-danger' : ratio >= 0.8 ? 'text-warning' : 'text-secondary';
  return (
    <span
      aria-label={`${label}: ${used.toLocaleString('en-US')} of ${limit === -1 ? 'unlimited' : limit.toLocaleString('en-US')}`}
      className={cn('whitespace-nowrap text-[12px] tabular-nums', tone)}
    >
      {used.toLocaleString('en-US')}
      <span className="text-muted"> / {limit === -1 ? '∞' : limit.toLocaleString('en-US')}</span>
    </span>
  );
}

export function DemoOrganizationsCard() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<DemoOrganization | null>(null);
  const defaults = useDemoDefaults();
  const { data, isLoading, isError, error, refetch } = useDemoOrganizations({ search, page, limit: PAGE_SIZE });

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const defaultLimits: PlanLimits | undefined = defaults.data?.limits;

  return (
    <div className="overflow-hidden rounded-xl border border-subtle bg-surface shadow-xs">
      <div className="flex flex-col gap-3 border-b border-subtle px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-olive-dark">
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-primary">Demo organizations</h3>
            <p className="text-[11px] text-muted">Usage this month against each organization&apos;s limits</p>
          </div>
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search organizations…"
            aria-label="Search organizations"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 px-5 py-6" aria-busy="true">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-raised" />)}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-14 text-center">
          <p className="text-sm text-secondary">Could not load demo organizations.</p>
          <p className="text-[11px] text-muted">{(error as Error | null)?.message ?? 'Please try again.'}</p>
          <Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center justify-center px-5 py-16">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-raised">
            <Building2 className="h-5 w-5 text-muted" />
          </div>
          <p className="text-sm text-secondary">
            {search ? `No demo organizations match “${search}”` : 'No demo organizations'}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {search ? 'Try another name or slug.' : 'Organizations on the demo plan will appear here.'}
          </p>
        </div>
      ) : (
        <>
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle bg-surface-raised/60">
                  <th className="px-5 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary">Organization</th>
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary">Demo ends</th>
                  {LIMIT_METRICS.map(({ metric, label }) => (
                    <th key={metric} className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary">
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary">Limits</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle/60">
                {data.items.map((org) => (
                  <tr key={org.organization_id} className="transition-colors hover:bg-olive-dark/30">
                    <td className="px-5 py-3">
                      <p className="max-w-[220px] truncate text-[13px] font-medium text-primary">{org.name}</p>
                      <p className="text-[11px] text-muted">
                        {org.slug} · since {new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <DemoEndCell endsAt={org.demo_ends_at} />
                    </td>
                    {LIMIT_METRICS.map(({ metric, label }) => (
                      <td key={metric} className="px-3 py-3">
                        <UsageCell label={label} used={org.usage[metric]} limit={org.effective_limits[metric]} />
                      </td>
                    ))}
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(org.limit_overrides).length > 0 ? (
                          <Badge variant="info">Custom</Badge>
                        ) : (
                          <Badge variant="default">Default</Badge>
                        )}
                        {!org.is_active && <Badge variant="destructive">Inactive</Badge>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditing(org)}
                        disabled={!defaultLimits}
                        aria-label={`Edit demo settings for ${org.name}`}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onPageChange={setPage} label="organizations" />
        </>
      )}

      <EditDemoLimitsDialog organization={editing} defaults={defaultLimits} onClose={() => setEditing(null)} />
    </div>
  );
}

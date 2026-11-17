'use client';

import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import type { PlatformLead, PlatformLeadSourceFilter } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { TablePagination } from '@/components/ui/table-pagination';
import { SegmentedControl } from '@/components/dashboard/segmented-control';
import { TableCard } from '@/components/dashboard/table-card';
import { usePlatformLeads } from '@/hooks/usePlatformAnalytics';
import { cn } from '@/lib/utils';
import { DEMO_STATUS_META, DEMO_TYPE_LABELS, ORGANIZATION_STATE_META, formatDay, relativeAge } from './platform-labels';
import { useDebouncedSearch } from './use-debounced-search';

const PAGE_SIZE = 8;
const SOURCES: Array<{ value: PlatformLeadSourceFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'demo_request', label: 'Demo requests' },
  { value: 'signup', label: 'Signups' },
];

const TH = 'px-3 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-secondary';

function Progress({ lead }: { lead: PlatformLead }) {
  if (lead.source === 'signup') return <span className="text-[12px] text-muted">Signed up directly</span>;
  const status = lead.demo_status ? DEMO_STATUS_META[lead.demo_status] : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status && <Badge variant={status.variant} className="whitespace-nowrap">{status.label}</Badge>}
      {lead.demo_status === 'ready' && (
        <span className="whitespace-nowrap text-[11px] text-muted">
          {lead.demo_opens ? `Opened ${lead.demo_opens}×` : 'Not opened'}
        </span>
      )}
    </div>
  );
}

function Account({ lead }: { lead: PlatformLead }) {
  if (!lead.organization) return <span className="text-[12px] text-muted">No account yet</span>;
  const state = ORGANIZATION_STATE_META[lead.organization.state];
  return (
    <div className="min-w-0">
      {lead.source === 'demo_request' && (
        <p className="max-w-[180px] truncate text-[12px] text-primary">{lead.organization.name}</p>
      )}
      <Badge variant={state.variant} className="whitespace-nowrap">{state.label}</Badge>
    </div>
  );
}

/** The newest demo requests and signups, and how far each one got. */
export function LatestLeadsCard() {
  const [source, setSource] = useState<PlatformLeadSourceFilter>('all');
  const [page, setPage] = useState(1);
  const { input, setInput, search } = useDebouncedSearch(() => setPage(1));
  const { data, isLoading, isError, refetch } = usePlatformLeads({ source, search, page, limit: PAGE_SIZE });

  return (
    <TableCard
      icon={<UserPlus />}
      title="Latest leads"
      subtitle="Demo form requests and self-service signups"
      toolbar={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SegmentedControl
            label="Lead source"
            options={SOURCES}
            value={source}
            onChange={(value) => { setSource(value); setPage(1); }}
          />
          <div className="relative sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search leads…"
              aria-label="Search leads"
              className="h-9 pl-8"
            />
          </div>
        </div>
      }
      isLoading={isLoading}
      isError={isError}
      errorText="Could not load leads."
      onRetry={() => refetch()}
      isEmpty={!data?.items.length}
      empty={search ? { title: `No leads match “${search}”`, hint: 'Try a name, email or company.' } : { title: 'No leads yet', hint: 'Demo requests and signups will appear here.' }}
      footer={data && <TablePagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onPageChange={setPage} label="leads" />}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-subtle bg-surface-raised/60">
            <th className={cn(TH, 'pl-5')}>Lead</th>
            <th className={TH}>Source</th>
            <th className={TH}>Interest</th>
            <th className={TH}>Progress</th>
            <th className={TH}>Account</th>
            <th className={cn(TH, 'pr-5 text-right')}>Received</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle/60">
          {data?.items.map((lead) => (
            <tr key={`${lead.source}:${lead.id}`} className="transition-colors hover:bg-olive-dark/30">
              <td className="px-5 py-3">
                <p className="max-w-[220px] truncate text-[13px] font-medium text-primary">{lead.name}</p>
                {lead.email && <p className="max-w-[220px] truncate text-[11px] text-muted">{lead.email}</p>}
              </td>
              <td className="px-3 py-3">
                <Badge variant={lead.source === 'demo_request' ? 'secondary' : 'default'} className="whitespace-nowrap">
                  {lead.source === 'demo_request' ? 'Demo request' : 'Signup'}
                </Badge>
              </td>
              <td className="px-3 py-3">
                {lead.source === 'demo_request' ? (
                  <>
                    <p className="whitespace-nowrap text-[12px] text-primary">{DEMO_TYPE_LABELS[lead.demo_type ?? ''] ?? lead.demo_type ?? '—'}</p>
                    {lead.company && <p className="max-w-[180px] truncate text-[11px] text-muted">{lead.company}</p>}
                  </>
                ) : (
                  <span className="text-[12px] text-muted">—</span>
                )}
              </td>
              <td className="px-3 py-3"><Progress lead={lead} /></td>
              <td className="px-3 py-3"><Account lead={lead} /></td>
              <td className="px-5 py-3 text-right">
                {relativeAge(lead.created_at) && (
                  <p className="whitespace-nowrap text-[12px] text-secondary">{relativeAge(lead.created_at)}</p>
                )}
                <p className={cn('whitespace-nowrap', relativeAge(lead.created_at) ? 'text-[11px] text-muted' : 'text-[12px] text-secondary')}>
                  {formatDay(lead.created_at)}
                </p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
  );
}

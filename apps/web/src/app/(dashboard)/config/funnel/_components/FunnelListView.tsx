'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FunnelStage } from '@/services/funnels.service';
import type { Contact } from '@/services/contacts.service';
import { useStageContacts } from '@/hooks/useContacts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { initialsOf, lastActivity, relativeTime } from './contactCardHelpers';
import { NoStages } from './NoStages';
import { stageColor } from './stageColors';

const PAGE_SIZE = 10;

interface ColumnState {
  contacts: Contact[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
}

interface Props {
  stages: FunnelStage[];
  onConfigure: () => void;
}

export function FunnelListView({ stages, onConfigure }: Props) {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [columns, setColumns] = useState<Record<string, ColumnState>>({});

  const report = useCallback((stageId: string, next: ColumnState) => {
    setColumns((prev) => {
      const current = prev[stageId];
      if (
        current &&
        current.contacts === next.contacts &&
        current.total === next.total &&
        current.isLoading === next.isLoading &&
        current.isFetching === next.isFetching
      ) {
        return prev;
      }
      return { ...prev, [stageId]: next };
    });
  }, []);

  if (sorted.length === 0) return <NoStages onConfigure={onConfigure} />;

  const rowCount = Math.max(
    1,
    ...sorted.map((stage) => columns[stage.id]?.contacts.length ?? 0),
  );

  return (
    <div className="overflow-x-auto rounded-card border border-subtle bg-surface">
      {sorted.map((stage) => (
        <StageQuery
          key={stage.id}
          stageId={stage.id}
          limit={limits[stage.id] ?? PAGE_SIZE}
          onChange={report}
        />
      ))}
      <table className="w-full border-collapse text-left" aria-label="Funnel contacts">
        <thead>
          <tr className="border-b border-subtle">
            {sorted.map((stage) => {
              const column = columns[stage.id];
              return (
                <th key={stage.id} scope="col" className="min-w-52 align-bottom px-3 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: stageColor(stage.color) }}
                    />
                    <span className="text-sm font-semibold text-primary truncate">{stage.name}</span>
                    {column?.isLoading ? (
                      <Skeleton className="h-5 w-8 rounded-full" />
                    ) : (
                      <Badge variant="neutral" className="normal-case shrink-0">
                        {column?.total ?? 0}
                      </Badge>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, row) => (
            <tr key={row} className="border-b border-subtle last:border-b-0">
              {sorted.map((stage) => (
                <StageCell key={stage.id} column={columns[stage.id]} row={row} />
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            {sorted.map((stage) => {
              const column = columns[stage.id];
              const shown = column?.contacts.length ?? 0;
              const total = column?.total ?? 0;
              return (
                <td key={stage.id} className="px-3 py-2 align-top">
                  {shown > 0 && (
                    <span className="text-xs text-muted">Showing {shown} of {total}</span>
                  )}
                  {shown < total && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      disabled={column?.isFetching}
                      onClick={() => setLimits((prev) => ({ ...prev, [stage.id]: shown + PAGE_SIZE }))}
                    >
                      {column?.isFetching ? 'Loading…' : 'Load more'}
                    </Button>
                  )}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StageQuery({
  stageId,
  limit,
  onChange,
}: {
  stageId: string;
  limit: number;
  onChange: (stageId: string, next: ColumnState) => void;
}) {
  const { data, isLoading, isFetching } = useStageContacts(stageId, limit);

  useEffect(() => {
    onChange(stageId, {
      contacts: data?.items ?? [],
      total: data?.meta.total ?? 0,
      isLoading,
      isFetching,
    });
  }, [stageId, data, isLoading, isFetching, onChange]);

  return null;
}

function StageCell({ column, row }: { column?: ColumnState; row: number }) {
  if (!column || column.isLoading) {
    return (
      <td className="px-3 py-2 align-top">
        {row < 2 && <Skeleton className="h-12 w-full rounded-lg" />}
      </td>
    );
  }

  const contact = column.contacts[row];
  if (!contact) {
    return (
      <td className="px-3 py-2 align-top">
        {row === 0 && column.contacts.length === 0 && (
          <p className="text-xs text-muted py-3">No contacts</p>
        )}
      </td>
    );
  }

  return (
    <td className="px-3 py-2 align-top">
      <ContactCell contact={contact} />
    </td>
  );
}

function ContactCell({ contact }: { contact: Contact }) {
  const router = useRouter();
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim() || 'Anonymous';
  const activity = lastActivity(contact);
  const detail = contact.phone || contact.email || (activity ? relativeTime(activity) : null);

  return (
    <button
      type="button"
      aria-label={`Open ${name}`}
      onClick={() => router.push(`/contacts/${contact.id}`)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover outline-hidden focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span className="w-7 h-7 rounded-full bg-olive-dark text-accent border border-accent/15 flex items-center justify-center text-[11px] font-semibold shrink-0">
        {initialsOf(contact)}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-primary truncate">{name}</span>
        {detail && <span className="block text-xs text-muted truncate">{detail}</span>}
      </span>
    </button>
  );
}

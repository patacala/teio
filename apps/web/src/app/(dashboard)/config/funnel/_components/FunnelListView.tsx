'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { FunnelStage } from '@/services/funnels.service';
import type { Contact } from '@/services/contacts.service';
import { useStageContacts } from '@/hooks/useContacts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { initialsOf, lastActivity, relativeTime } from './contactCardHelpers';
import { NoStages } from './NoStages';
import { stageColor } from './stageColors';

const PAGE_SIZE = 10;
/** Fixed widths keep the columns aligned across every stage section. */
const COLUMNS: { label: string; width: string }[] = [
  { label: 'Name', width: 'w-[26%]' },
  { label: 'Phone', width: 'w-[16%]' },
  { label: 'Email', width: 'w-[21%]' },
  { label: 'Score', width: 'w-[14%]' },
  { label: 'Handled by', width: 'w-[11%]' },
  { label: 'Last activity', width: 'w-[12%]' },
];

interface Props {
  stages: FunnelStage[];
  onConfigure: () => void;
}

export function FunnelListView({ stages, onConfigure }: Props) {
  const sorted = [...stages].sort((a, b) => a.position - b.position);
  if (sorted.length === 0) return <NoStages onConfigure={onConfigure} />;

  return (
    <div className="space-y-3">
      {sorted.map((stage) => (
        <StageSection key={stage.id} stage={stage} />
      ))}
    </div>
  );
}

function StageSection({ stage }: { stage: FunnelStage }) {
  const [open, setOpen] = useState(true);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading, isFetching } = useStageContacts(stage.id, limit);
  const contacts = data?.items ?? [];
  const total = data?.meta.total ?? 0;

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          className="flex w-full items-center gap-3 px-4 py-3 text-left rounded-card outline-hidden transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stageColor(stage.color) }} />
          <span className="text-sm font-semibold text-primary flex-1 truncate">{stage.name}</span>
          {isLoading ? (
            <Skeleton className="h-5 w-8 rounded-full" />
          ) : (
            <Badge variant="neutral" className="normal-case">{total} {total === 1 ? 'contact' : 'contacts'}</Badge>
          )}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-subtle">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : contacts.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">No contacts in this stage</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] table-fixed">
                    <thead>
                      <tr className="border-b border-subtle">
                        {COLUMNS.map(({ label, width }) => (
                          <th key={label} className={`${width} text-left text-[11px] font-semibold text-muted uppercase tracking-wider px-4 py-2.5`}>
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <ContactRow key={contact.id} contact={contact} />
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-xs text-muted">
                    Showing {contacts.length} of {total}
                  </span>
                  {contacts.length < total && (
                    <Button variant="ghost" size="sm" disabled={isFetching} onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                      {isFetching ? 'Loading…' : 'Load more'}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  const router = useRouter();
  const name = `${contact.first_name} ${contact.last_name ?? ''}`.trim() || 'Anonymous';
  const score = contact.lead_score ?? 0;
  const activity = lastActivity(contact);
  const open = () => router.push(`/contacts/${contact.id}`);

  return (
    <tr
      tabIndex={0}
      aria-label={`Open ${name}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      className="border-b border-subtle last:border-b-0 cursor-pointer transition-colors hover:bg-surface-raised outline-hidden focus-visible:bg-surface-raised"
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-olive-dark text-accent border border-accent/15 flex items-center justify-center text-[11px] font-semibold shrink-0">
            {initialsOf(contact)}
          </div>
          <span className="text-sm font-medium text-primary truncate">{name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5 text-sm text-secondary truncate">{contact.phone ?? <span className="text-muted">—</span>}</td>
      <td className="px-4 py-2.5 text-sm text-secondary truncate">{contact.email ?? <span className="text-muted">—</span>}</td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-[72px]">
          <div className="flex-1 bg-surface-raised rounded-full h-1.5">
            <div className="bg-accent h-1.5 rounded-full" style={{ width: `${score}%` }} />
          </div>
          <span className="text-xs text-secondary w-6 text-right">{score}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {contact.handled_by === 'human' ? <Badge variant="neutral">Human</Badge> : <Badge variant="ai">AI</Badge>}
      </td>
      <td className="px-4 py-2.5 text-xs text-secondary">
        {activity ? relativeTime(activity) : <span className="text-muted">—</span>}
      </td>
    </tr>
  );
}

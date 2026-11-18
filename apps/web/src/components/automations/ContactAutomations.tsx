'use client';

import { useMemo, useState } from 'react';
import type { RunSummary } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/useToast';
import { useAutomations, useContactAutomationRuns, useEnrollInAutomation } from '@/hooks/useAutomations';
import { formatRelativeTime } from '@/lib/utils';
import { RUN_STATUS, RunDrawer } from './RunsPanel';

/** Finished runs shown under "History" (the AI automation adds one per message). */
const HISTORY = 15;

function isActive(run: RunSummary) {
  return run.status === 'waiting' || run.status === 'running';
}

function RunRow({ run, onOpen }: { run: RunSummary; onOpen(): void }) {
  const status = RUN_STATUS[run.status];
  const when = isActive(run)
    ? run.resume_at
      ? `continues ${formatRelativeTime(run.resume_at)}`
      : `started ${formatRelativeTime(run.started_at)}`
    : formatRelativeTime(run.finished_at ?? run.started_at);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-[11px] hover:bg-surface-raised"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-primary">{run.automation_name ?? 'Automation'}</span>
        <span className="block truncate text-muted">{when}</span>
      </span>
      <Badge variant={status.variant}>{status.label}</Badge>
    </button>
  );
}

/**
 * The automations a contact is in (and was recently), for the inbox sidebar.
 * Anyone on the team can look at a run, stop it, or add the contact to an
 * automation that accepts contacts by hand.
 */
export function ContactAutomations({ contactId }: { contactId: string }) {
  const { data: runs, isLoading } = useContactAutomationRuns(contactId);
  const { data: automations } = useAutomations();
  const enroll = useEnrollInAutomation();
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [picking, setPicking] = useState<string>('');

  const active = useMemo(() => (runs ?? []).filter(isActive), [runs]);
  const finished = useMemo(() => (runs ?? []).filter((r) => !isActive(r)), [runs]);
  const manual = useMemo(
    () => (automations ?? []).filter((a) => a.status === 'active' && a.trigger_keys.includes('manual')),
    [automations],
  );

  const add = async () => {
    const target = manual.find((a) => a.id === picking);
    if (!target) return;
    try {
      const { started } = await enroll.mutateAsync({ id: target.id, contactIds: [contactId] });
      if (started.length) {
        toast({ title: `Added to ${target.name}` });
        setPicking('');
      } else {
        toast({ title: 'Not added: the contact opted out, is already in it, or cannot enter it again', variant: 'error' });
      }
    } catch (err) {
      toast({ title: (err as Error).message || 'Could not add the contact', variant: 'error' });
    }
  };

  if (isLoading) return <Skeleton className="h-10 w-full rounded-lg" />;

  return (
    <div className="space-y-2">
      {active.length ? (
        <div className="space-y-0.5">
          {active.map((run) => (
            <RunRow key={run.id} run={run} onOpen={() => setOpenRun(run.id)} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted">Not in any automation right now.</p>
      )}

      {finished.length > 0 && (
        <div>
          <button type="button" className="text-[11px] text-accent hover:underline" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide history' : `History (${finished.length})`}
          </button>
          {showHistory && (
            <div className="mt-1 space-y-0.5">
              {finished.slice(0, HISTORY).map((run) => (
                <RunRow key={run.id} run={run} onOpen={() => setOpenRun(run.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {manual.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={picking} onValueChange={setPicking}>
            <SelectTrigger className="h-8 flex-1 text-xs" aria-label="Automation to add the contact to">
              <SelectValue placeholder="Add to automation…" />
            </SelectTrigger>
            <SelectContent>
              {manual.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!picking || enroll.isPending} onClick={add}>
            {enroll.isPending ? 'Adding…' : 'Add'}
          </Button>
        </div>
      )}

      <RunDrawer runId={openRun} onClose={() => setOpenRun(null)} />
    </div>
  );
}

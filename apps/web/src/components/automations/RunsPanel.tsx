'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { NODE_CATALOG, type AutomationGraph, type RunDetail, type RunStatus, type RunStep, type RunSummary } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/useToast';
import { useAutomation, useAutomationRun, useAutomationRuns, useCancelAutomationRun } from '@/hooks/useAutomations';
import { formatRelativeTime } from '@/lib/utils';
import { NODE_ICONS, nodeLabel as labelOfNode, triggerLabel } from './automation-ui';
import { HANDLE_LABELS } from './builder/layout';

const PAGE = 25;

export const RUN_STATUS: Record<RunStatus, { label: string; variant: 'info' | 'success' | 'warn' | 'destructive' | 'neutral' }> = {
  waiting: { label: 'Waiting', variant: 'info' },
  running: { label: 'Running', variant: 'info' },
  completed: { label: 'Completed', variant: 'success' },
  exited: { label: 'Stopped early', variant: 'neutral' },
  failed: { label: 'Failed', variant: 'destructive' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
};

function stepDetail(step: RunStep): string {
  const o = step.output as Record<string, unknown>;
  const d = step.deliveries;
  const parts: string[] = [];
  if (d.sent || d.failed || d.skipped) {
    parts.push([d.sent && `${d.sent} sent`, d.skipped && `${d.skipped} skipped`, d.failed && `${d.failed} failed`].filter(Boolean).join(', '));
  }
  if (typeof o.channel === 'string') parts.push(`via ${o.channel}`);
  if (typeof o.until === 'string' && step.status === 'running') parts.push(`until ${new Date(o.until).toLocaleString()}`);
  if (typeof o.timeout_at === 'string' && step.status === 'running') parts.push(`waiting until ${new Date(o.timeout_at).toLocaleString()} at the latest`);
  if (o.held_until) parts.push(`held until ${new Date(String(o.held_until)).toLocaleString()} (business hours)`);
  if (typeof o.task_id === 'string') parts.push('task created in the agenda');
  if (o.matched === true) parts.push('conditions met');
  if (o.matched === false) parts.push('conditions not met');
  if (typeof o.resumed_by === 'string') parts.push(`continued: ${triggerLabel(o.resumed_by)}`);
  if (typeof o.agent_name === 'string') parts.push(`sent to ${o.agent_name}`);
  return parts.join(' · ');
}

export function RunTimeline({ run, graph }: { run: RunDetail; graph?: AutomationGraph }) {
  const labelOf = (step: RunStep) => {
    const node = graph?.nodes.find((n) => n.key === step.node_key);
    return node ? labelOfNode(node) : NODE_CATALOG[step.node_type]?.label ?? step.node_key;
  };
  return (
    <ol className="space-y-3">
      {run.steps.map((step) => {
        const Icon = NODE_ICONS[step.node_type] ?? Loader2;
        const branch = step.branch && step.branch !== 'next' ? HANDLE_LABELS[step.branch as keyof typeof HANDLE_LABELS] : null;
        return (
          <li key={step.step_no} className="flex gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-olive-dark text-accent">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-primary">{labelOf(step)}</span>
                <Badge variant={step.status === 'failed' ? 'destructive' : step.status === 'running' ? 'info' : 'success'}>
                  {step.status === 'running' ? 'in progress' : step.status}
                </Badge>
                {branch && <Badge variant="outline">{branch}</Badge>}
              </div>
              {stepDetail(step) && <p className="mt-0.5 text-[11px] text-secondary">{stepDetail(step)}</p>}
              {step.error && <p className="mt-0.5 text-[11px] text-danger">{step.error}</p>}
              <p className="text-[10px] text-muted">{new Date(step.started_at).toLocaleString()}</p>
            </div>
          </li>
        );
      })}
      {!run.steps.length && <p className="text-xs text-muted">No step has run yet.</p>}
    </ol>
  );
}

export function RunDrawer({ runId, graph, onClose }: { runId: string | null; graph?: AutomationGraph; onClose(): void }) {
  const { data: run, isLoading } = useAutomationRun(runId);
  // Opened from a contact: step names come from the automation itself.
  const { data: automation } = useAutomation(!graph && run ? run.automation_id : null);
  const stepGraph = graph ?? automation?.published?.graph;
  const cancel = useCancelAutomationRun();
  const active = run && (run.status === 'waiting' || run.status === 'running');
  return (
    <Drawer open={!!runId} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="flex flex-col sm:max-w-md">
        <DrawerHeader>
          <DrawerTitle>{run?.contact?.name ?? (run?.scope === 'organization' ? 'Scheduled run' : 'Run')}</DrawerTitle>
          {run && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-secondary">
              <Badge variant={RUN_STATUS[run.status].variant}>{RUN_STATUS[run.status].label}</Badge>
              <span>{triggerLabel(run.trigger_key)}</span>
              <span>· version {run.version}</span>
              <span>· started {formatRelativeTime(run.started_at)}</span>
            </div>
          )}
        </DrawerHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {isLoading || !run ? (
            <Skeleton className="h-32 w-full rounded-xl" />
          ) : (
            <>
              {run.exit_reason && <p className="text-[11px] text-secondary">{run.exit_reason}</p>}
              {run.last_error && <p className="rounded-lg bg-danger/10 p-2 text-[11px] text-danger">{run.last_error}</p>}
              {run.status === 'waiting' && run.resume_at && <p className="text-[11px] text-secondary">Continues {new Date(run.resume_at).toLocaleString()}</p>}
              <RunTimeline run={run} graph={stepGraph} />
            </>
          )}
        </div>
        {active && (
          <div className="border-t border-subtle pt-3">
            <Button
              variant="destructive"
              size="sm"
              disabled={cancel.isPending}
              onClick={async () => {
                try {
                  await cancel.mutateAsync(run.id);
                  toast({ title: 'Run stopped' });
                } catch (err) {
                  toast({ title: (err as Error).message, variant: 'error' });
                }
              }}
            >
              Stop this run
            </Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

/** Runs of one automation: who is in it, where, and what happened. */
export function RunsPanel({ automationId, graph }: { automationId: string; graph?: AutomationGraph }) {
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useAutomationRuns(automationId, { status: status === 'all' ? undefined : status, limit: PAGE, offset: page * PAGE });
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE));
  const nodeLabel = (key: string | null) => {
    const node = key ? graph?.nodes.find((n) => n.key === key) : undefined;
    return node ? labelOfNode(node) : key ?? '—';
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-secondary">{data ? `${data.total} run${data.total === 1 ? '' : 's'}` : ' '}</p>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as RunStatus | 'all');
            setPage(0);
          }}
        >
          <SelectTrigger className="h-8 w-44 text-xs" aria-label="Filter runs by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All runs</SelectItem>
            {(Object.keys(RUN_STATUS) as RunStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {RUN_STATUS[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : !data?.items.length ? (
        <p className="rounded-xl border border-dashed border-subtle py-12 text-center text-xs text-muted">No runs yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-subtle">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-raised text-[11px] text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Contact</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Step</th>
                <th className="px-3 py-2 font-medium">Started</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((run: RunSummary) => (
                <tr key={run.id} className="cursor-pointer border-t border-subtle hover:bg-surface-hover" onClick={() => setOpen(run.id)}>
                  <td className="px-3 py-2 text-primary">{run.contact?.name ?? 'Whole organization'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={RUN_STATUS[run.status].variant}>{RUN_STATUS[run.status].label}</Badge>
                  </td>
                  <td className="px-3 py-2 text-secondary">{run.status === 'waiting' || run.status === 'running' ? nodeLabel(run.current_node_key) : run.exit_reason ?? run.last_error ?? '—'}</td>
                  <td className="px-3 py-2 text-secondary">{formatRelativeTime(run.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-[11px] text-muted">
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      <RunDrawer runId={open} graph={graph} onClose={() => setOpen(null)} />
    </div>
  );
}

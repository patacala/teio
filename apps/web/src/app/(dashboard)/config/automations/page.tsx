'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, Plus, Trash2, Workflow } from 'lucide-react';
import type { AutomationCategory, AutomationSummary } from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/useToast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useAutomationAction,
  useAutomations,
  useCreateAutomation,
  useDeleteAutomation,
  usePauseAutomation,
} from '@/hooks/useAutomations';
import { AUTOMATION_CATEGORY_LABELS, triggerLabel } from '@/components/automations/automation-ui';
import { AUTOMATION_STATUS } from '@/components/automations/builder/AutomationBuilder';
import { STARTER_TEMPLATES } from '@/components/automations/starter-templates';

const CATEGORY_ORDER: AutomationCategory[] = ['ai', 'booking', 'follow_up', 'messaging', 'custom'];

function AutomationRow({ automation, canManage }: { automation: AutomationSummary; canManage: boolean }) {
  const pause = usePauseAutomation();
  const resume = useAutomationAction('resume');
  const duplicate = useAutomationAction('duplicate');
  const remove = useDeleteAutomation();
  const router = useRouter();
  const status = AUTOMATION_STATUS[automation.status];
  const toggling = pause.isPending || resume.isPending;

  const toggle = async (on: boolean) => {
    try {
      if (on) await resume.mutateAsync(automation.id);
      else await pause.mutateAsync({ id: automation.id });
      toast({ title: on ? `"${automation.name}" is active` : `"${automation.name}" is paused` });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-subtle bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/config/automations/${automation.id}`} className="truncate text-sm font-semibold text-primary hover:underline">
            {automation.name}
          </Link>
          <Badge variant={status.variant}>{status.label}</Badge>
          {automation.is_system && <Badge variant="outline">Platform</Badge>}
          {automation.has_unpublished_changes && automation.published_version && <Badge variant="warn">Unpublished changes</Badge>}
        </div>
        {automation.description && <p className="mt-0.5 line-clamp-1 text-xs text-secondary">{automation.description}</p>}
        <p className="mt-1 text-[11px] text-muted">
          {automation.trigger_keys.length ? `When: ${automation.trigger_keys.map(triggerLabel).join(' or ')}` : 'No trigger yet'}
          {' · '}
          {automation.stats.active_runs} in progress · {automation.stats.completed_7d} done this week
          {automation.stats.failed_7d > 0 && <span className="text-danger"> · {automation.stats.failed_7d} failed</span>}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {canManage && automation.status !== 'draft' && (
          <span className="mr-2 flex items-center gap-2">
            {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
            <Switch
              checked={automation.status === 'active'}
              disabled={toggling || (!automation.published_version && automation.status !== 'active')}
              onCheckedChange={toggle}
              aria-label={`${automation.status === 'active' ? 'Pause' : 'Activate'} ${automation.name}`}
            />
          </span>
        )}
        {canManage && (
          <button
            type="button"
            aria-label={`Duplicate ${automation.name}`}
            disabled={duplicate.isPending}
            onClick={async () => {
              try {
                const copy = await duplicate.mutateAsync(automation.id);
                router.push(`/config/automations/${copy.id}`);
              } catch (err) {
                toast({ title: (err as Error).message, variant: 'error' });
              }
            }}
            className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-primary"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
        {canManage && !automation.is_system && (
          <button
            type="button"
            aria-label={`Delete ${automation.name}`}
            disabled={remove.isPending}
            onClick={async () => {
              if (!window.confirm(`Delete "${automation.name}"? Contacts in progress stop, and its history is removed.`)) return;
              try {
                await remove.mutateAsync(automation.id);
                toast({ title: 'Automation deleted' });
              } catch (err) {
                toast({ title: (err as Error).message, variant: 'error' });
              }
            }}
            className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function TemplateGallery({ open, onClose }: { open: boolean; onClose(): void }) {
  const create = useCreateAutomation();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New automation</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2 sm:grid-cols-2">
          {STARTER_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={create.isPending}
              onClick={async () => {
                try {
                  const automation = await create.mutateAsync({ name: t.id === 'blank' ? 'New automation' : t.name, description: t.id === 'blank' ? undefined : t.description, draft: t.definition });
                  router.push(`/config/automations/${automation.id}`);
                } catch (err) {
                  toast({ title: (err as Error).message, variant: 'error' });
                }
              }}
              className="flex items-start gap-3 rounded-xl border border-subtle p-3 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-olive-dark text-accent">
                <t.icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-sm font-medium text-primary">{t.name}</span>
                <span className="block text-[11px] text-secondary">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function AutomationsPage() {
  const { data: automations, isLoading } = useAutomations();
  const { canManageConfiguration } = usePermissions();
  const [creating, setCreating] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<AutomationCategory, AutomationSummary[]>();
    for (const a of automations ?? []) map.set(a.category, [...(map.get(a.category) ?? []), a]);
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [automations]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-primary">Automations</h1>
          <p className="mt-0.5 max-w-2xl text-xs text-secondary">
            Decide what happens when something happens: who answers incoming messages (the AI agent or not), the messages contacts receive about their
            bookings, follow-ups, alerts for the team, and messages on a schedule.
          </p>
        </div>
        {canManageConfiguration && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New automation
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !automations?.length ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-subtle py-24 text-center">
          <Workflow className="mb-3 h-8 w-8 text-accent" />
          <p className="text-sm font-medium text-primary">No automations yet</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{AUTOMATION_CATEGORY_LABELS[category]}</h2>
              {items.map((a) => (
                <AutomationRow key={a.id} automation={a} canManage={canManageConfiguration} />
              ))}
            </section>
          ))}
        </div>
      )}

      <TemplateGallery open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

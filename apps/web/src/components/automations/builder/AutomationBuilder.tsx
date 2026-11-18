'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Info, Loader2, Pause, Play, Rocket, Save, Trash2 } from 'lucide-react';
import {
  NODE_CATALOG,
  type AutomationDefinition,
  type AutomationDetail,
  type AutomationNode,
  type NodeType,
  type ValidationIssue,
} from '@crm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/useToast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useAutomationAction,
  useAutomationCatalog,
  useAutomations,
  usePauseAutomation,
  useRenameAutomation,
  useSaveAutomationDraft,
  useValidateAutomation,
} from '@/hooks/useAutomations';
import { ApiError } from '@/lib/auth-client';
import { RunsPanel } from '../RunsPanel';
import { nodeLabel, triggerScope } from '../automation-ui';
import { AutomationCanvas, type Selection } from './AutomationCanvas';
import { NodePanel } from './NodePanel';
import { NodePicker } from './NodePicker';
import { SettingsPanel, TriggerPanel } from './TriggerPanel';
import { canInsertAt, childOf, createNode, insertNode, removalSize, removeNode, type InsertPoint } from './graph-ops';

export const AUTOMATION_STATUS: Record<AutomationDetail['status'], { label: string; variant: 'success' | 'warn' | 'neutral' | 'info' }> = {
  active: { label: 'Active', variant: 'success' },
  paused: { label: 'Paused', variant: 'warn' },
  draft: { label: 'Draft', variant: 'neutral' },
  archived: { label: 'Archived', variant: 'neutral' },
};

function issueTarget(issue: ValidationIssue): string {
  if (issue.node_key) return issue.node_key;
  if (issue.path?.startsWith('settings')) return 'settings';
  return 'trigger';
}

/** The editor of one automation: the canvas, the settings of what is selected, publishing and its runs. */
export function AutomationBuilder({ automation }: { automation: AutomationDetail }) {
  const { canManageConfiguration } = usePermissions();
  const readOnly = !canManageConfiguration;
  const { data: catalog } = useAutomationCatalog();
  const { data: allAutomations } = useAutomations();
  const save = useSaveAutomationDraft();
  const validate = useValidateAutomation();
  const publish = useAutomationAction('publish');
  const resume = useAutomationAction('resume');
  const pause = usePauseAutomation();
  const rename = useRenameAutomation();

  const [draft, setDraft] = useState<AutomationDefinition>(automation.draft);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<Selection>(automation.draft.triggers.length ? null : { kind: 'trigger' });
  const [adding, setAdding] = useState<InsertPoint | null>(null);
  const [tab, setTab] = useState<'builder' | 'runs'>('builder');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [name, setName] = useState(automation.name);

  // After a save or publish, follow the server copy (unless the user kept editing).
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!dirtyRef.current) setDraft(automation.draft);
    setName(automation.name);
  }, [automation.updated_at, automation.draft, automation.name]);

  // Check the draft as it changes (the API validator is the single source of rules).
  const validateRef = useRef(validate.mutateAsync);
  validateRef.current = validate.mutateAsync;
  useEffect(() => {
    const timer = setTimeout(() => {
      validateRef.current(draft).then(
        (r) => setIssues(r.issues),
        () => undefined,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const update = (next: AutomationDefinition) => {
    setDraft(next);
    setDirty(true);
  };
  const scope = useMemo(() => triggerScope(draft.triggers), [draft.triggers]);
  const issuesByTarget = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues) map.set(issueTarget(issue), [...(map.get(issueTarget(issue)) ?? []), issue.message]);
    return map;
  }, [issues]);

  // Automations are independent (D16): two that send incoming messages to the AI make it answer twice.
  const otherAiOnIncoming = useMemo(() => {
    const thisOne = draft.triggers.some((t) => t.key === 'message.received') && draft.graph.nodes.some((n) => n.type === 'send_to_ai');
    if (!thisOne) return [];
    return (allAutomations ?? []).filter(
      (a) => a.id !== automation.id && a.status === 'active' && a.sends_to_ai && a.trigger_keys.includes('message.received'),
    );
  }, [allAutomations, automation.id, draft.triggers, draft.graph.nodes]);

  const selectedNode = selection?.kind === 'node' ? draft.graph.nodes.find((n) => n.key === selection.key) : undefined;

  const unavailableReason = (type: NodeType): string | null => {
    const entry = NODE_CATALOG[type];
    if (scope.organization && entry.needsContact) return 'Needs a contact: not available in scheduled automations';
    if (!scope.organization && entry.needsConversation && !scope.hasConversation) return 'Needs a message, conversation, payment or call trigger';
    if (type === 'send_to_ai' && catalog && !catalog.ai_connections.length) return 'Connect an AI agent first (Settings → AI Agent)';
    if (adding && !canInsertAt(draft.graph, adding, type)) return '"End" can only be added at the end of a path';
    return null;
  };

  const addStep = (type: NodeType) => {
    if (!adding) return;
    const node = createNode(draft.graph, type);
    update({ ...draft, graph: insertNode(draft.graph, adding, node) });
    setAdding(null);
    setSelection({ kind: 'node', key: node.key });
  };

  const deleteStep = (key: string) => {
    const size = removalSize(draft.graph, key);
    if (size > 1 && !window.confirm(`Delete this step and the ${size - 1} step(s) in its branches?`)) return;
    update({ ...draft, graph: removeNode(draft.graph, key) });
    setSelection(null);
  };

  const persist = async () => {
    const saved = await save.mutateAsync({ id: automation.id, draft });
    setDirty(false);
    return saved;
  };

  const handleSave = async () => {
    try {
      await persist();
      toast({ title: 'Draft saved' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handlePublish = async () => {
    try {
      if (dirty) await persist();
      await publish.mutateAsync(automation.id);
      toast({ title: automation.published_version ? 'Changes published' : 'Automation published and active' });
    } catch (err) {
      const found = err instanceof ApiError && Array.isArray(err.errors) ? (err.errors as ValidationIssue[]) : null;
      if (found) {
        setIssues(found);
        toast({ title: `Fix ${found.length} problem${found.length === 1 ? '' : 's'} before publishing`, variant: 'error' });
      } else toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handlePause = async () => {
    const stopRuns = automation.stats.active_runs > 0 && window.confirm(`Also stop the ${automation.stats.active_runs} contact(s) in progress? (Cancel keeps them going.)`);
    try {
      await pause.mutateAsync({ id: automation.id, stopRuns });
      toast({ title: 'Automation paused' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleResume = async () => {
    try {
      await resume.mutateAsync(automation.id);
      toast({ title: 'Automation active' });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
    }
  };

  const handleRename = async () => {
    const next = name.trim();
    if (!next || next === automation.name) return setName(automation.name);
    try {
      await rename.mutateAsync({ id: automation.id, name: next });
    } catch (err) {
      toast({ title: (err as Error).message, variant: 'error' });
      setName(automation.name);
    }
  };

  const status = AUTOMATION_STATUS[automation.status];
  const busy = save.isPending || publish.isPending || pause.isPending || resume.isPending;
  const canPause = automation.status === 'active';
  const canResume = automation.status === 'paused' && !!automation.published_version;

  const setNode = (node: AutomationNode) => update({ ...draft, graph: { ...draft.graph, nodes: draft.graph.nodes.map((n) => (n.key === node.key ? node : n)) } });

  return (
    <div className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-xl border border-subtle bg-surface">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-subtle px-4 py-2.5">
        <Link href="/config/automations" className="rounded-md p-1 text-secondary hover:bg-surface-hover hover:text-primary" aria-label="Back to automations">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          disabled={readOnly}
          aria-label="Automation name"
          className="h-8 w-auto min-w-[220px] max-w-sm border-transparent bg-transparent text-sm font-semibold hover:border-subtle"
        />
        <Badge variant={status.variant}>{status.label}</Badge>
        {automation.published_version && <span className="text-[11px] text-muted">v{automation.published_version}</span>}
        {(dirty || automation.has_unpublished_changes) && automation.published_version && (
          <Badge variant="warn">{dirty ? 'Unsaved changes' : 'Unpublished changes'}</Badge>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'builder' | 'runs')} className="ml-auto">
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="runs">Runs{automation.stats.active_runs ? ` (${automation.stats.active_runs})` : ''}</TabsTrigger>
          </TabsList>
        </Tabs>

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={!dirty || busy} className="gap-1.5">
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save draft
            </Button>
            {canPause && (
              <Button variant="outline" size="sm" onClick={handlePause} disabled={busy} className="gap-1.5">
                <Pause className="h-3.5 w-3.5" /> Pause
              </Button>
            )}
            {canResume && !dirty && !automation.has_unpublished_changes && (
              <Button variant="outline" size="sm" onClick={handleResume} disabled={busy} className="gap-1.5">
                <Play className="h-3.5 w-3.5" /> Activate
              </Button>
            )}
            <Button size="sm" onClick={handlePublish} disabled={busy || (!dirty && !automation.has_unpublished_changes && automation.status === 'active')} className="gap-1.5">
              {publish.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
              Publish
            </Button>
          </div>
        )}
      </div>

      {automation.is_system && (
        <div className="flex items-start gap-2 border-b border-subtle bg-surface-raised px-4 py-2 text-[11px] text-secondary">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Platform automation{automation.template_key === 'ai_incoming_message' ? ' — pausing it stops the AI agent from answering on every channel' : ''}. You can edit
            its content and steps; it cannot be deleted.
          </span>
        </div>
      )}

      {otherAiOnIncoming.length > 0 && (
        <div className="flex items-start gap-2 border-b border-subtle bg-warning/10 px-4 py-2 text-[11px] text-secondary" role="note">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            {otherAiOnIncoming.length === 1 ? `"${otherAiOnIncoming[0].name}" also sends` : `${otherAiOnIncoming.length} other active automations also send`} incoming
            messages to the AI agent. When both run on the same message, the agent gets it more than once and may answer twice.
          </span>
        </div>
      )}

      {tab === 'runs' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RunsPanel automationId={automation.id} graph={automation.published?.graph ?? draft.graph} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <AutomationCanvas
              graph={draft.graph}
              triggers={draft.triggers}
              selection={selection}
              onSelect={setSelection}
              onAdd={(point) => setAdding(point)}
              issues={issuesByTarget}
              readOnly={readOnly}
            />
            {issues.length > 0 && (
              <div className="absolute bottom-3 right-3 max-w-sm rounded-lg border border-warning/40 bg-surface p-2.5 shadow-sm" role="status">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" /> {issues.length} problem{issues.length === 1 ? '' : 's'} to fix before publishing
                </p>
                <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                  {issues.map((issue, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="text-left text-[11px] text-secondary hover:text-primary"
                        onClick={() => {
                          const target = issueTarget(issue);
                          setSelection(target === 'trigger' ? { kind: 'trigger' } : target === 'settings' ? { kind: 'settings' } : { kind: 'node', key: target });
                        }}
                      >
                        {(() => {
                          const node = issue.node_key ? draft.graph.nodes.find((n) => n.key === issue.node_key) : undefined;
                          return node ? `${nodeLabel(node)}: ${issue.message}` : issue.message;
                        })()}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {selection && (
            <aside className="thin-scrollbar w-[380px] shrink-0 overflow-y-auto border-l border-subtle p-4" aria-label="Step settings">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-primary">
                  {selection.kind === 'trigger' ? 'Trigger' : selection.kind === 'settings' ? 'Settings' : selectedNode ? nodeLabel(selectedNode) : ''}
                </h2>
                <button type="button" onClick={() => setSelection(null)} className="text-[11px] text-muted hover:text-primary">
                  Close
                </button>
              </div>
              {selection.kind === 'trigger' && (
                <TriggerPanel triggers={draft.triggers} onChange={(triggers) => update({ ...draft, triggers })} catalog={catalog} disabled={readOnly} />
              )}
              {selection.kind === 'settings' && (
                <SettingsPanel settings={draft.settings} triggers={draft.triggers} onChange={(settings) => update({ ...draft, settings })} catalog={catalog} disabled={readOnly} />
              )}
              {selectedNode && (
                <div className="space-y-4">
                  <NodePanel key={selectedNode.key} node={selectedNode} scope={scope} catalog={catalog} disabled={readOnly} onChange={setNode} />
                  {(issuesByTarget.get(selectedNode.key) ?? []).map((message, i) => (
                    <p key={i} className="flex items-start gap-1.5 text-[11px] text-warning">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {message}
                    </p>
                  ))}
                  {!readOnly && (
                    <div className="flex flex-wrap gap-2 border-t border-subtle pt-3">
                      {NODE_CATALOG[selectedNode.type].handles.includes('failed') && !childOf(draft.graph, selectedNode.key, 'failed') && (
                        <Button variant="outline" size="sm" onClick={() => setAdding({ source: selectedNode.key, handle: 'failed' })}>
                          Add a step if it fails
                        </Button>
                      )}
                      <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => deleteStep(selectedNode.key)}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete step
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      <NodePicker open={!!adding} onClose={() => setAdding(null)} onPick={addStep} unavailableReason={unavailableReason} />
    </div>
  );
}

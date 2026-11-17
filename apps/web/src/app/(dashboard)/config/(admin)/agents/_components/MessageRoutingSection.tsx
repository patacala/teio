'use client';

import { useAutomationAgents, useSetActiveAutomationAgent } from '@/hooks/useAutomationAgents';
import { toast } from '@/hooks/useToast';
import { Webhook } from 'lucide-react';

const TRIGGER_EVENT = 'message.received';

/**
 * Manual switch for who replies to inbound messages: ProSales or an n8n
 * workflow. Exactly one automation agent for `message.received` is ever
 * active — there is no automatic fallback (see CLAUDE.md /
 * agent-trigger.processor.ts). Switching here just flips `is_active` on the
 * chosen row and deactivates the rest; nothing else changes server-side
 * until the next inbound message.
 *
 * Hidden unless there are at least two candidates. A single option is not a
 * choice, so the card would only repeat the agent that is already active.
 */
export function MessageRoutingSection() {
  const { data: agents, isLoading } = useAutomationAgents();
  const setActive = useSetActiveAutomationAgent();

  const candidates = (agents ?? []).filter((a) => a.trigger_event === TRIGGER_EVENT);

  const handleActivate = async (agentId: string) => {
    try {
      await setActive.mutateAsync({
        triggerEvent: TRIGGER_EVENT,
        activateId: agentId,
        allForEvent: candidates,
      });
      toast({ title: 'Message routing updated', variant: 'default' });
    } catch {
      toast({ title: 'Failed to update routing', variant: 'error' });
    }
  };

  if (isLoading || candidates.length < 2) {
    return null;
  }

  return (
    <div className="rounded-xl border border-subtle bg-surface p-4">
      <div className="flex items-center gap-2 mb-1">
        <Webhook className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-primary">Who replies to messages</h2>
      </div>
      <p className="text-xs text-secondary mb-3">
        Only one can be active at a time for <code>{TRIGGER_EVENT}</code>. Switching here doesn&apos;t
        affect ongoing conversations, only the next inbound messages.
      </p>
      <div className="flex flex-col gap-2">
        {candidates.map((agent) => (
          <label
            key={agent.id}
            className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
              agent.is_active
                ? 'border-accent/30 bg-olive-dark'
                : 'border-subtle hover:bg-surface-raised'
            }`}
          >
            <input
              type="radio"
              name="message-routing"
              checked={agent.is_active}
              disabled={setActive.isPending}
              onChange={() => handleActivate(agent.id)}
              className="h-4 w-4"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-primary truncate">{agent.name}</p>
              <p className="text-xs text-muted truncate">
                {agent.workflow_endpoint}
              </p>
            </div>
            {agent.is_active && (
              <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/10 text-success">
                active
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

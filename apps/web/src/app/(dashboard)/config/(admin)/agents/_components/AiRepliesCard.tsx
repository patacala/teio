'use client';

import Link from 'next/link';
import { Workflow } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAutomations } from '@/hooks/useAutomations';

/**
 * The agent only receives messages through automations with a "Send to AI"
 * step. This card says whether the built-in incoming-message automation is
 * on, and links to it.
 */
export function AiRepliesCard() {
  const { data: automations, isLoading } = useAutomations();
  if (isLoading || !automations) return null;

  const incoming = automations.find((a) => a.template_key === 'ai_incoming_message');
  const on = incoming?.status === 'active';

  return (
    <div className="rounded-xl border border-subtle bg-surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <Workflow className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold text-primary">Incoming messages to the agent</h2>
        <Badge variant={on ? 'success' : 'warn'}>{on ? 'On' : 'Off'}</Badge>
      </div>
      <p className="text-xs text-secondary">
        {on
          ? 'The agent answers incoming messages on every channel, unless a team member took the conversation over. This is an automation: pause or change it in Automations.'
          : 'The automation that sends incoming messages to the agent is not active, so the agent does not answer new messages (unless another automation of yours sends them). Turn it on in Automations.'}
      </p>
      <Link
        href={incoming ? `/config/automations/${incoming.id}` : '/config/automations'}
        className="mt-2 inline-block text-xs font-medium text-accent hover:underline"
      >
        {incoming ? 'Open the incoming-message automation' : 'Go to Automations'}
      </Link>
    </div>
  );
}

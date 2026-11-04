'use client';

import { useState } from 'react';
import { useHandoff } from '@/hooks/useConversations';
import { Button } from '@/components/ui/button';
import { Bot, User } from 'lucide-react';

interface AgentStatusToggleProps {
  conversationId: string;
  botActive: boolean;
}

export function AgentStatusToggle({ conversationId, botActive: initialBotActive }: AgentStatusToggleProps) {
  const [botActive, setBotActive] = useState(initialBotActive);
  const handoff = useHandoff();

  const handleToggle = async () => {
    const next = !botActive;
    setBotActive(next);
    try {
      await handoff.mutateAsync(conversationId);
    } catch {
      setBotActive(!next);
    }
  };

  return (
    <div className="flex gap-1.5">
      <Button
        variant={botActive ? 'default' : 'outline'}
        size="sm"
        className={`flex-1 h-7 text-xs gap-1 ${botActive ? 'border border-accent/20 bg-olive-dark text-accent hover:bg-olive-dark' : ''}`}
        onClick={handleToggle}
        disabled={handoff.isPending}
      >
        <Bot className="h-3.5 w-3.5" />
        AI Active
      </Button>
      <Button
        variant={!botActive ? 'default' : 'outline'}
        size="sm"
        className={`flex-1 h-7 text-xs gap-1 ${!botActive ? 'border border-warning/25 bg-warning/10 text-warning hover:bg-warning/15' : ''}`}
        onClick={handleToggle}
        disabled={handoff.isPending}
      >
        <User className="h-3.5 w-3.5" />
        Human
      </Button>
    </div>
  );
}

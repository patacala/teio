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
        className="flex-1 h-7 text-xs gap-1"
        onClick={handleToggle}
        disabled={handoff.isPending}
      >
        <Bot className="h-3.5 w-3.5" />
        AI Active
      </Button>
      <Button
        variant={!botActive ? 'default' : 'outline'}
        size="sm"
        className={`flex-1 h-7 text-xs gap-1 ${!botActive ? 'bg-amber-500 hover:bg-amber-600 border-amber-500' : ''}`}
        onClick={handleToggle}
        disabled={handoff.isPending}
      >
        <User className="h-3.5 w-3.5" />
        Human
      </Button>
    </div>
  );
}

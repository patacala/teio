'use client';

import { usePresence } from '@/hooks/usePresence';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { getInitials } from '@/lib/utils';

interface PresenceIndicatorsProps {
  conversationId: string;
}

export function PresenceIndicators({ conversationId }: PresenceIndicatorsProps) {
  const { presentUsers } = usePresence(conversationId);
  if (presentUsers.length === 0) return null;

  const visible = presentUsers.slice(0, 3);
  const overflow = presentUsers.length - 3;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        <div className="flex -space-x-2">
          {visible.map((u) => (
            <Tooltip key={u.userId}>
              <TooltipTrigger asChild>
                <div className="w-6 h-6 rounded-full bg-accent/20 border-2 border-surface flex items-center justify-center text-[9px] font-bold text-accent cursor-default">
                  {getInitials(u.userName)}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">{u.userName}</TooltipContent>
            </Tooltip>
          ))}
          {overflow > 0 && (
            <div className="w-6 h-6 rounded-full bg-surface-hover border-2 border-surface flex items-center justify-center text-[9px] font-bold text-secondary">
              +{overflow}
            </div>
          )}
        </div>
        <span className="text-xs text-muted">viewing</span>
      </div>
    </TooltipProvider>
  );
}

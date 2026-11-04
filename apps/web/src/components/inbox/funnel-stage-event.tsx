import { ArrowRight } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface FunnelStageEventProps {
  fromStage: string;
  toStage: string;
  reason?: string;
  timestamp: string;
}

export function FunnelStageEvent({ fromStage, toStage, reason, timestamp }: FunnelStageEventProps) {
  return (
    <div className="flex flex-col items-center my-2">
      <div className="flex items-center gap-3 w-full px-4">
        <div className="flex-1 h-px bg-divider" />
        <div className="flex items-center gap-1.5 text-xs text-secondary">
          <span className="font-medium">{fromStage}</span>
          <ArrowRight className="h-3.5 w-3.5 text-accent shrink-0" />
          <span className="font-medium text-accent">{toStage}</span>
        </div>
        <div className="flex-1 h-px bg-divider" />
      </div>
      {reason && (
        <p className="text-[11px] text-muted italic mt-0.5">{reason}</p>
      )}
      <span className="text-[10px] text-muted mt-0.5">{formatRelativeTime(timestamp)}</span>
    </div>
  );
}

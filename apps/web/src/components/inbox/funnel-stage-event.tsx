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
        <div className="flex-1 h-px bg-border" />
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="font-medium">{fromStage}</span>
          <ArrowRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          <span className="font-medium text-blue-600">{toStage}</span>
        </div>
        <div className="flex-1 h-px bg-border" />
      </div>
      {reason && (
        <p className="text-[11px] text-gray-400 italic mt-0.5">{reason}</p>
      )}
      <span className="text-[10px] text-gray-300 mt-0.5">{formatRelativeTime(timestamp)}</span>
    </div>
  );
}

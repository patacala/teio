import { Bot } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface AiDecisionCardProps {
  decisionType: string;
  details: string;
  timestamp: string;
}

export function AiDecisionCard({ decisionType, details, timestamp }: AiDecisionCardProps) {
  return (
    <div className="flex justify-center my-2">
      <div className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 max-w-sm w-full mx-auto">
        <div className="flex items-center gap-1.5 mb-1">
          <Bot className="h-3.5 w-3.5 text-purple-500 shrink-0" />
          <span className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
            {decisionType}
          </span>
        </div>
        <p className="text-xs text-gray-600">{details}</p>
        <p className="text-[10px] text-gray-400 mt-1">{formatRelativeTime(timestamp)}</p>
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';

interface SystemEventProps {
  content: string;
  timestamp?: string;
  className?: string;
}

export function SystemEvent({ content, timestamp, className }: SystemEventProps) {
  return (
    <div className={cn('flex flex-col items-center my-2', className)}>
      <div className="flex items-center gap-3 w-full px-4">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-gray-400 italic">{content}</span>
        <div className="flex-1 h-px bg-border" />
      </div>
      {timestamp && (
        <span className="text-[10px] text-gray-300 mt-0.5">
          {formatRelativeTime(timestamp)}
        </span>
      )}
    </div>
  );
}

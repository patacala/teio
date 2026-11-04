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
        <div className="flex-1 h-px bg-divider" />
        <span className="text-xs text-muted italic">{content}</span>
        <div className="flex-1 h-px bg-divider" />
      </div>
      {timestamp && (
        <span className="text-[10px] text-muted mt-0.5">
          {formatRelativeTime(timestamp)}
        </span>
      )}
    </div>
  );
}

import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AIResponseIndicator({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        'bg-olive-dark text-accent/75',
        className,
      )}
    >
      <Bot className="h-3 w-3" />
      AI
    </span>
  );
}

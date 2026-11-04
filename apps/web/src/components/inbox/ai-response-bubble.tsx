'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { AIResponseIndicator } from './ai-response-indicator';
import { ChannelBadge } from './channel-badge';

interface AIResponseBubbleProps {
  content: string;
  timestamp: string;
  channel: string;
  className?: string;
}

export function AIResponseBubble({ content, timestamp, channel, className }: AIResponseBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex my-1 min-w-0 max-w-full justify-start', className)}
      style={{ width: '100%' }}
    >
      <div className="max-w-[70%] min-w-0 flex flex-col items-start space-y-1">
        <AIResponseIndicator />
        <div className="rounded-xl rounded-bl-sm border-l-2 border-accent/30 bg-surface-raised px-3.5 py-2.5 text-sm text-primary w-fit max-w-full min-w-0 box-border">
          <p className="whitespace-pre-wrap wrap-break-word wrap-anywhere">{content}</p>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 max-w-full">
          <span className="text-[10px] text-muted truncate">{formatRelativeTime(timestamp)}</span>
          <ChannelBadge channel={channel} />
        </div>
      </div>
    </motion.div>
  );
}

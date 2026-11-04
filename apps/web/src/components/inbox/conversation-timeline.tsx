'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMessages } from '@/hooks/useMessages';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { MessageBubble } from './message-bubble';
import { StreamingMessageBubble } from './streaming-message-bubble';
import { TypingIndicator } from './typing-indicator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { TypingUser } from '@/hooks/useTypingIndicator';

interface ConversationTimelineProps {
  conversationId: string;
  typingUsers: TypingUser[];
  className?: string;
}

export function ConversationTimeline({
  conversationId,
  typingUsers,
  className,
}: ConversationTimelineProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: messagesData, isLoading } = useMessages(conversationId);
  const { streamingMessages } = useRealtimeMessages(conversationId);

  const messages = messagesData?.items ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingMessages.size]);

  return (
    <div className={cn('flex-1 flex flex-col min-w-0 overflow-hidden', className)}>
      <ScrollArea className="flex-1 px-4 py-2">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className="h-12 w-48 rounded-xl" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted">No messages yet</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}

        <AnimatePresence>
          {Array.from(streamingMessages.entries()).map(([id, content]) => (
            <StreamingMessageBubble key={id} content={content} />
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </ScrollArea>

      <AnimatePresence>
        {typingUsers.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-1 overflow-hidden"
          >
            <TypingIndicator senderType={typingUsers[0].senderType} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

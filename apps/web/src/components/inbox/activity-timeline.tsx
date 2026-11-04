'use client';

import { useMemo, useRef } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { motion, AnimatePresence } from 'framer-motion';
import { useContactActivity } from '@/hooks/useContactActivity';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { MessageBubble } from './message-bubble';
import { VoiceCallCard } from './voice-call-card';
import { SystemEvent } from './system-event';
import { AiDecisionCard } from './ai-decision-card';
import { FunnelStageEvent } from './funnel-stage-event';
import { AppointmentEvent } from './appointment-event';
import { ContactDataUpdatedEvent } from './contact-data-updated-event';
import { StreamingMessageBubble } from './streaming-message-bubble';
import { TypingIndicator } from './typing-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import type { TypingUser } from '@/hooks/useTypingIndicator';
import type { ActivityEvent, ActivityPage } from '@/services/activity.service';
import type { Message } from '@/services/conversations.service';

interface ActivityTimelineProps {
  conversationId: string;
  contactId: string;
  typingUsers: TypingUser[];
}

function activityMessageToMessage(event: Extract<ActivityEvent, { type: 'message' }>): Message {
  return {
    id: event.id,
    conversation_id: '',
    content: event.content,
    direction: event.direction,
    sender_type: event.sender_type as Message['sender_type'],
    type: (event.message_type as Message['type']) || 'text',
    channel: event.channel,
    created_at: event.timestamp,
    metadata: event.metadata,
  };
}

function mergeActivityPages(pages: ActivityPage[] | undefined): ActivityEvent[] {
  const seen = new Set<string>();
  const merged: ActivityEvent[] = [];
  for (const event of pages?.flatMap((p) => p.events) ?? []) {
    // Voice calls are rendered from CallEntity; the mirrored system message
    // would otherwise show up twice (bubble + card).
    if (event.type === 'message' && event.channel === 'voice' && event.sender_type === 'system') {
      continue;
    }
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return merged;
}

function ActivityEventRow({ event }: { event: ActivityEvent }) {
  switch (event.type) {
    case 'message':
      return <MessageBubble message={activityMessageToMessage(event)} />;
    case 'voice_call':
      return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex my-1 justify-start">
          <VoiceCallCard
            duration={event.duration}
            transcript={event.transcript_preview}
            recordingUrl={event.recording_url}
            direction={event.direction}
          />
        </motion.div>
      );
    case 'system_event':
      return <SystemEvent content={event.content} timestamp={event.timestamp} />;
    case 'ai_decision':
      return (
        <AiDecisionCard
          decisionType={event.decision_type}
          details={event.details}
          timestamp={event.timestamp}
        />
      );
    case 'funnel_change':
      return (
        <FunnelStageEvent
          fromStage={event.from_stage}
          toStage={event.to_stage}
          reason={event.reason}
          timestamp={event.timestamp}
        />
      );
    case 'appointment_event':
      return <AppointmentEvent action={event.action} timestamp={event.timestamp} />;
    case 'contact_data_updated':
      return <ContactDataUpdatedEvent changedFields={event.changed_fields} timestamp={event.timestamp} />;
    default:
      return null;
  }
}

// Virtuoso needs a starting index that can only ever go down as older pages
// get prepended (it uses this to keep item identity/scroll-anchor stable
// across prepends). This ceiling just needs to comfortably exceed how many
// events a single contact could ever load across a session.
const START_INDEX = 1_000_000;

export function ActivityTimeline({ conversationId, contactId, typingUsers }: ActivityTimelineProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useContactActivity(contactId);
  const { streamingMessages } = useRealtimeMessages(conversationId);

  // data.pages is a new array reference on every query settle, but the merge
  // itself (flatMap + dedup Set + sort) is real work that scales with total
  // loaded events — worth skipping on renders that don't touch it (typing
  // indicator toggling, scroll events, etc.).
  const sortedEvents = useMemo(() => mergeActivityPages(data?.pages), [data?.pages]);
  const firstItemIndex = START_INDEX - sortedEvents.length;

  const hasStreaming = streamingMessages.size > 0;
  const hasTyping = typingUsers.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative" style={{ contain: 'layout' }}>
      {isLoading ? (
        <div className="flex-1 px-4 py-2 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className="h-12 w-48 rounded-xl" />
            </div>
          ))}
        </div>
      ) : sortedEvents.length === 0 ? (
        <div className="flex-1 py-12 text-center text-sm text-muted">No activity yet</div>
      ) : (
        // Virtuoso only mounts what's actually visible (plus a small overscan
        // buffer) instead of every loaded event's full component tree —
        // without this, a contact with hundreds of messages loaded across
        // several "scroll up for more" cycles keeps every one of them
        // mounted forever, and it only gets slower from there. It also owns
        // prepend-without-jumping and follow-to-bottom natively, replacing
        // what used to be a hand-rolled scroll-position-preservation effect.
        <Virtuoso
          ref={virtuosoRef}
          className="thin-scrollbar flex-1 px-4 py-2 virtuoso-viewport-fix"
          style={{ overflowX: 'hidden' }}
          data={sortedEvents}
          firstItemIndex={firstItemIndex}
          initialTopMostItemIndex={sortedEvents.length - 1}
          alignToBottom
          followOutput={(isAtBottom) => (isAtBottom ? 'auto' : false)}
          startReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          itemContent={(_index, event) => (
            <div className="w-full min-w-0 max-w-full">
              <ActivityEventRow event={event} />
            </div>
          )}
          components={{
            Header: () =>
              isFetchingNextPage ? (
                <div className="space-y-2 mb-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                      <Skeleton className="h-10 w-40 rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : null,
            Footer: () =>
              hasStreaming ? (
                <AnimatePresence>
                  {Array.from(streamingMessages.entries()).map(([id, content]) => (
                    <StreamingMessageBubble key={id} content={content} />
                  ))}
                </AnimatePresence>
              ) : null,
          }}
        />
      )}

      <AnimatePresence>
        {hasTyping && (
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

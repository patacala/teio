'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import { ChannelBadge } from './channel-badge';
import { VoiceCallCard } from './voice-call-card';
import { AIResponseBubble } from './ai-response-bubble';
import { AIResponseIndicator } from './ai-response-indicator';
import { SystemEvent } from './system-event';
import type { Message } from '@/services/conversations.service';

interface MessageBubbleProps {
  message: Message;
}

// The AI drafts a lot of structured info as plain-text lines — "- Label: value"
// field lists and "1) option" menus — which reads as a wall of prose inside a
// chat bubble. Parsing those patterns into real rows/chips makes them
// scannable without needing the backend to emit structured metadata.
type ContentBlock =
  | { kind: 'text'; text: string }
  | { kind: 'fields'; items: { label: string; value: string }[] }
  | { kind: 'options'; items: string[] };

const FIELD_LINE = /^-\s*\*{0,2}([^:*]+?)\*{0,2}:\s*(.+)$/;
const OPTION_LINE = /^\**(\d+)[).]\s*(.+?)\**$/;

function parseMessageContent(content: string): ContentBlock[] {
  const lines = content.split('\n');
  const blocks: ContentBlock[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    const text = textBuffer.join('\n').trim();
    if (text) blocks.push({ kind: 'text', text });
    textBuffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    if (FIELD_LINE.test(lines[i])) {
      flushText();
      const items: { label: string; value: string }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(FIELD_LINE);
        if (!m) break;
        items.push({ label: m[1].trim(), value: m[2].trim() });
        i++;
      }
      blocks.push({ kind: 'fields', items });
      continue;
    }
    if (OPTION_LINE.test(lines[i])) {
      flushText();
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(OPTION_LINE);
        if (!m) break;
        items.push(m[2].trim());
        i++;
      }
      blocks.push({ kind: 'options', items });
      continue;
    }
    textBuffer.push(lines[i]);
    i++;
  }
  flushText();
  return blocks;
}

function MessageContent({ content, isOutbound }: { content: string; isOutbound: boolean }) {
  const blocks = parseMessageContent(content);

  // Nothing structured found — keep the original plain paragraph, unchanged.
  if (blocks.every((b) => b.kind === 'text')) {
    return <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{content}</p>;
  }

  return (
    <div className="space-y-2 min-w-0">
      {blocks.map((block, idx) => {
        if (block.kind === 'text') {
          return (
            <p key={idx} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {block.text}
            </p>
          );
        }
        if (block.kind === 'fields') {
          return (
            <div key={idx} className={cn('rounded-lg overflow-hidden', isOutbound ? 'bg-white/10' : 'bg-white')}>
              {block.items.map((it, i2) => (
                <div
                  key={i2}
                  className={cn(
                    'flex items-baseline gap-3 px-2.5 py-1.5 text-xs min-w-0',
                    i2 > 0 && (isOutbound ? 'border-t border-white/15' : 'border-t border-gray-200'),
                  )}
                >
                  <span className={cn('shrink-0 font-medium', isOutbound ? 'text-blue-100' : 'text-gray-500')}>
                    {it.label}
                  </span>
                  <span
                    className={cn(
                      'text-right ml-auto min-w-0 break-words [overflow-wrap:anywhere]',
                      isOutbound ? 'text-white' : 'text-gray-900',
                    )}
                  >
                    {it.value}
                  </span>
                </div>
              ))}
            </div>
          );
        }
        // options
        return (
          <div key={idx} className="space-y-1">
            {block.items.map((opt, i2) => (
              <div
                key={i2}
                className={cn(
                  'flex items-start gap-2 rounded-md px-2.5 py-1.5 text-xs min-w-0',
                  isOutbound ? 'bg-white/10' : 'bg-white border border-gray-200',
                )}
              >
                <span
                  className={cn(
                    'shrink-0 flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold mt-px',
                    isOutbound ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700',
                  )}
                >
                  {i2 + 1}
                </span>
                <span
                  className={cn(
                    'min-w-0 break-words [overflow-wrap:anywhere]',
                    isOutbound ? 'text-white' : 'text-gray-900',
                  )}
                >
                  {opt}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  // Calls are persisted with type 'system' — the messages CHECK constraint has
  // no 'voice' value — so they are matched on the call metadata written by
  // CallsService.upsertCallMessage, and before the generic system branch or
  // they render as a plain text event with no player.
  const meta = message.metadata as
    | {
        call_id?: string;
        duration_seconds?: number;
        transcript?: string;
        summary?: string;
        recording_url?: string;
        direction?: 'inbound' | 'outbound';
      }
    | undefined;

  if (meta?.call_id && message.channel === 'voice') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex my-1',
          message.direction === 'outbound' ? 'justify-end' : 'justify-start',
        )}
      >
        <VoiceCallCard
          duration={meta.duration_seconds}
          transcript={meta.transcript}
          summary={meta.summary}
          recordingUrl={meta.recording_url}
          direction={meta.direction}
        />
      </motion.div>
    );
  }

  if (message.type === 'system') {
    return <SystemEvent content={message.content} timestamp={message.created_at} />;
  }

  const isOutbound = message.direction === 'outbound';
  const isAI = message.sender_type === 'ai';

  if (isAI && !isOutbound) {
    return (
      <AIResponseBubble
        content={message.content}
        timestamp={message.created_at}
        channel={message.channel}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex my-1 min-w-0 max-w-full', isOutbound ? 'justify-end' : 'justify-start')}
      style={{ width: '100%' }}
    >
      <div className={cn('max-w-[70%] min-w-0 space-y-1', isOutbound ? 'items-end' : 'items-start', 'flex flex-col')}>
        {isOutbound && isAI && <AIResponseIndicator />}

        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm w-fit max-w-full min-w-0 box-border',
            isOutbound
              ? 'bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm',
          )}
        >
          <MessageContent content={message.content} isOutbound={isOutbound} />
        </div>

        <div className={cn('flex items-center gap-1.5 min-w-0 max-w-full', isOutbound ? 'flex-row-reverse' : 'flex-row')}>
          <span className="text-[10px] text-gray-400 truncate">
            {formatRelativeTime(message.created_at)}
          </span>
          <ChannelBadge channel={message.channel} />
        </div>
      </div>
    </motion.div>
  );
}

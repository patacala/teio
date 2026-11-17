'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ChannelBadge } from './channel-badge';
import { TemplateSelector } from './template-selector';
import { Send, Paperclip } from 'lucide-react';

interface MessageComposerProps {
  conversationId: string;
  channel: string;
  onSend: (content: string) => Promise<void>;
  isSending: boolean;
  sendTyping: () => void;
  stopTyping: () => void;
  className?: string;
}

export function MessageComposer({
  channel,
  onSend,
  isSending,
  sendTyping,
  stopTyping,
  className,
}: MessageComposerProps) {
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || isSending) return;
    setDraft('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onSend(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn('px-4 py-3 border-t border-subtle shrink-0', className)}>
      {/* Reply via row — this conversation is scoped to one channel, so it's informational, not a choice */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-secondary">Reply via:</span>
        <ChannelBadge channel={channel} showLabel />
      </div>

      {/* Composer row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 rounded-xl border border-subtle bg-surface-raised px-3 py-2">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="Type a message…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              sendTyping();
            }}
            onKeyDown={handleKeyDown}
            onBlur={stopTyping}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = el.scrollHeight + 'px';
            }}
            className="w-full bg-transparent text-sm text-primary placeholder:text-muted resize-none outline-hidden max-h-32"
            style={{ height: 'auto', minHeight: '24px' }}
          />
          <div className="flex items-center justify-end mt-1">
            <span className="text-[10px] text-muted hidden sm:block">
              Enter to send · Shift+Enter for new line
            </span>
          </div>
        </div>

        {/* Side buttons */}
        <div className="flex flex-col gap-1">
          <Button variant="ghost" size="icon" disabled className="h-8 w-8 shrink-0">
            <Paperclip className="h-4 w-4" />
          </Button>
          <TemplateSelector
            channel={channel}
            onSelect={(content) => setDraft(content)}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!draft.trim() || isSending}
            className="h-8 w-8 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

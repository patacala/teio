'use client';

import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  const [selectedChannel, setSelectedChannel] = useState(channel);
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
    <div className={cn('px-4 py-3 border-t border-border shrink-0', className)}>
      {/* Reply via row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500">Reply via:</span>
        <Select value={selectedChannel} onValueChange={setSelectedChannel}>
          <SelectTrigger className="h-6 w-auto text-xs px-2 py-0 border-border bg-transparent">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
            <SelectItem value="voice">Voice</SelectItem>
            <SelectItem value="webchat">Web Chat</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Composer row */}
      <div className="flex items-end gap-2">
        <div className="flex-1 rounded-xl border border-border bg-gray-50 px-3 py-2">
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
            className="w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 resize-none outline-none max-h-32"
            style={{ height: 'auto', minHeight: '24px' }}
          />
          <div className="flex items-center justify-between mt-1">
            <ChannelBadge channel={selectedChannel} />
            <span className="text-[10px] text-gray-400 hidden sm:block">
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
            channel={selectedChannel}
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

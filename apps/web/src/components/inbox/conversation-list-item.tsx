'use client';

import { Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInitials, formatRelativeTime } from '@/lib/utils';
import { ChannelBadge } from './channel-badge';
import type { Conversation } from '@/services/conversations.service';

interface ConversationListItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
  onTogglePin: () => void;
}

export function ConversationListItem({
  conversation,
  isActive,
  onClick,
  onTogglePin,
}: ConversationListItemProps) {
  const contact = conversation.contact;
  const fullName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Anonymous'
    : 'Unknown';
  const initials = getInitials(fullName);
  const time = conversation.last_message
    ? formatRelativeTime(conversation.last_message.created_at)
    : formatRelativeTime(conversation.updated_at);
  const lastMsg = conversation.last_message
    ? `${conversation.last_message.direction === 'outbound' ? '↑ ' : ''}${conversation.last_message.content}`
    : null;
  const isUnread = conversation.unread_count > 0;

  return (
    <div
      className={cn(
        'group relative w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-subtle',
        isActive
          ? 'bg-olive-dark border-l-2 border-l-accent/50'
          : 'hover:bg-surface-raised border-l-2 border-l-transparent',
      )}
    >
      <button onClick={onClick} className="flex items-start gap-3 flex-1 min-w-0 text-left">
        {/* Avatar */}
        <div className="relative shrink-0 mt-0.5">
          <div className="w-9 h-9 rounded-full bg-olive-dark text-accent flex items-center justify-center text-xs font-bold">
            {initials}
          </div>
          {/* Unread dot — single accent color, not a severity signal */}
          {isUnread && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-surface" />
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Row 1: name + time — grid with minmax(0,1fr) forces the cell to shrink below content size */}
          <div className="grid items-center gap-1" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
            <p
              className={cn(
                'truncate text-sm',
                isUnread ? 'font-bold' : 'font-medium',
                isActive ? 'text-accent' : 'text-primary',
              )}
            >
              {fullName}
            </p>
            <span className="text-[10px] text-muted whitespace-nowrap pr-4">{time}</span>
          </div>

          {/* Row 2: channel + message preview */}
          <div className="grid items-center gap-1.5 mt-0.5" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
            <ChannelBadge channel={conversation.channel} showLabel />
            <p className={cn('truncate text-xs', isUnread ? 'text-primary font-medium' : 'text-muted')}>
              {isUnread && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-accent mr-1">
                  {conversation.unread_count}
                </span>
              )}
              {lastMsg ?? ''}
            </p>
          </div>
        </div>
      </button>

      {/* Pin toggle — always visible when pinned, hover-only otherwise */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin();
        }}
        title={conversation.is_pinned ? 'Unpin conversation' : 'Pin conversation'}
        className={cn(
          'absolute top-2.5 right-2.5 p-1 rounded-md transition-opacity',
          conversation.is_pinned
            ? 'text-accent opacity-100'
            : 'text-muted opacity-0 group-hover:opacity-100 hover:text-secondary hover:bg-surface-hover',
        )}
      >
        <Pin className={cn('h-3.5 w-3.5', conversation.is_pinned && 'fill-accent')} />
      </button>
    </div>
  );
}

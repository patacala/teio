'use client';

import { useState } from 'react';
import { useConversations, useSetPinned } from '@/hooks/useConversations';
import { ConversationListItem } from './conversation-list-item';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Inbox, Pin, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/services/conversations.service';

type SortOrder = 'newest' | 'oldest';

const CHANNELS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'sms', label: 'SMS' },
  { id: 'voice', label: 'Voice' },
  { id: 'webchat', label: 'Web' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'email', label: 'Email' },
] as const;

interface ConversationListPanelProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationListPanel({ selectedId, onSelect }: ConversationListPanelProps) {
  const [order, setOrder] = useState<SortOrder>('newest');
  const [search, setSearch] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<'ai' | 'human' | null>(null);

  const { data, isLoading } = useConversations({ 
    search: search || undefined,
    channel: selectedChannel || undefined,
    assigned_to: assignedTo || undefined,
  });
  const setPinned = useSetPinned();

  // Backend returns newest-first (pinned first, then last_message_at DESC).
  // "Oldest" is just the reverse — cheap client-side flip, no extra round trip.
  const orderedItems = order === 'newest' ? data?.items : [...(data?.items ?? [])].reverse();

  // Splitting here renders pinned items in their own section (matches the
  // pattern other inbox tools use — pinned items don't scroll away with
  // normal list activity).
  const pinned = orderedItems?.filter((c) => c.is_pinned) ?? [];
  const rest = orderedItems?.filter((c) => !c.is_pinned) ?? [];

  const renderItem = (conv: Conversation) => (
    <ConversationListItem
      key={conv.id}
      conversation={conv}
      isActive={conv.id === selectedId}
      onClick={() => onSelect(conv.id)}
      onTogglePin={() => setPinned.mutate({ id: conv.id, pinned: !conv.is_pinned })}
    />
  );

  return (
    <div className="w-[320px] shrink-0 flex flex-col border-r border-border bg-white">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-900">Inbox</h2>
          {data?.meta?.total !== undefined && (
            <span className="text-[10px] text-gray-400 font-medium">
              {data.meta.total} conversations
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs bg-gray-50 border-border"
          />
        </div>

        {/* Channel filters */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Canales
            </span>
            {selectedChannel && (
              <button
                onClick={() => setSelectedChannel(null)}
                className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
              >
                Ver todos
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((channel) => {
              const isActive = selectedChannel === channel.id;
              return (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(isActive ? null : channel.id)}
                  className={cn(
                    'inline-flex items-center px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
                  )}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* AI / Human filter */}
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={() => setAssignedTo(assignedTo === 'ai' ? null : 'ai')}
            className={cn(
              'flex-1 inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all',
              assignedTo === 'ai'
                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
            )}
          >
            AI Active
          </button>
          <button
            onClick={() => setAssignedTo(assignedTo === 'human' ? null : 'human')}
            className={cn(
              'flex-1 inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all',
              assignedTo === 'human'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
            )}
          >
            Human
          </button>
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 px-1 py-2">
                <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : data?.items?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
              <Inbox className="h-4 w-4 text-gray-400" />
            </div>
            <p className="text-xs font-medium text-gray-500">
              {search ? 'No conversations found' : 'No conversations yet'}
            </p>
            {search && (
              <p className="text-[11px] text-gray-400 mt-1">Try a different search</p>
            )}
          </div>
        ) : (
          <>
            {pinned.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 px-4 pt-2.5 pb-1">
                  <Pin className="h-3 w-3 text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                    Pinned
                  </span>
                </div>
                {pinned.map(renderItem)}
              </div>
            )}
            {pinned.length > 0 && rest.length > 0 && (
              <div className="px-4 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  All conversations
                </span>
              </div>
            )}
            {rest.map(renderItem)}
          </>
        )}
      </ScrollArea>
    </div>
  );
}

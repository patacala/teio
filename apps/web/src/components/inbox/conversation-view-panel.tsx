'use client';

import { useConversation, useResolveConversation } from '@/hooks/useConversations';
import { useSendMessage } from '@/hooks/useMessages';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { ActivityTimeline } from './activity-timeline';
import { MessageComposer } from './message-composer';
import { ChannelBadge } from './channel-badge';
import { PresenceIndicators } from './presence-indicators';
import { ActiveCallIndicator } from './active-call-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, CheckCheck } from 'lucide-react';
import { getInitials } from '@/lib/utils';

interface ConversationViewPanelProps {
  conversationId: string | null;
}

export function ConversationViewPanel({ conversationId }: ConversationViewPanelProps) {
  const { data: conversation, isLoading: convLoading } = useConversation(conversationId);
  const sendMessage = useSendMessage(conversationId, conversation?.contact_id);
  const resolve = useResolveConversation();
  const { typingUsers, sendTyping, stopTyping } = useTypingIndicator(conversationId);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <Send className="h-5 w-5 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">Select a conversation</p>
          <p className="text-xs text-gray-400 mt-1">to start messaging</p>
        </div>
      </div>
    );
  }

  const contact = conversation?.contact;
  const fullName = contact
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Anonymous'
    : '…';

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-border shrink-0">
        {convLoading ? (
          <Skeleton className="h-5 w-40" />
        ) : (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
              {getInitials(fullName)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{fullName}</p>
              <div className="flex items-center gap-2">
                {conversation?.channel && <ChannelBadge channel={conversation.channel} showLabel />}
                <Badge variant={conversation?.status === 'open' ? 'secondary' : 'default'} className="text-[10px]">
                  {conversation?.status}
                </Badge>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <PresenceIndicators conversationId={conversationId} />
          {conversation?.status !== 'resolved' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => resolve.mutate(conversation!.id)}
              disabled={resolve.isPending}
              className="gap-1.5"
            >
              <CheckCheck className="h-4 w-4" />
              Resolve
            </Button>
          )}
        </div>
      </div>

      <ActiveCallIndicator conversationId={conversationId} />

      {conversation?.contact_id ? (
        <ActivityTimeline
          // Force a full remount per conversation — without this, React reuses
          // the same instance across selections, so scroll position, refs, and
          // the scroll-to-bottom effect's stale-length comparison all leak
          // from whichever conversation was open before.
          key={conversationId}
          conversationId={conversationId}
          contactId={conversation.contact_id}
          typingUsers={typingUsers}
        />
      ) : (
        <ActivityTimeline
          key={conversationId}
          conversationId={conversationId}
          contactId=""
          typingUsers={typingUsers}
        />
      )}

      <MessageComposer
        conversationId={conversationId}
        channel={conversation?.channel ?? 'sms'}
        onSend={async (content) => { await sendMessage.mutateAsync({ content }); }}
        isSending={sendMessage.isPending}
        sendTyping={sendTyping}
        stopTyping={stopTyping}
      />
    </div>
  );
}

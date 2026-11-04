'use client';

import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useContactMessages } from '@/hooks/useContacts';

interface Props {
  contactId: string;
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function ConversationsSummaryCard({ contactId }: Props) {
  const router = useRouter();
  const { data, isLoading } = useContactMessages(contactId);

  const conversations = (data?.conversations ?? []).filter((c: { channel?: string }) => c.channel !== 'voice');
  const latest = conversations[0];

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-primary">Conversations</h3>
      </div>

      {isLoading ? (
        <div className="h-10 bg-surface-raised animate-pulse rounded-sm" />
      ) : (
        <>
          <p className="text-2xl font-bold text-primary">{conversations.length}</p>
          <p className="text-xs text-secondary mt-0.5">total conversations</p>
          {latest && (
            <div className="mt-3 text-xs text-secondary">
              <span className="capitalize font-medium text-primary">{latest.channel}</span>
              {latest.last_message_at && (
                <> · {timeAgo(latest.last_message_at)}</>
              )}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full"
            onClick={() => router.push(`/inbox?contactId=${contactId}`)}
          >
            View Conversations
          </Button>
        </>
      )}
    </div>
  );
}

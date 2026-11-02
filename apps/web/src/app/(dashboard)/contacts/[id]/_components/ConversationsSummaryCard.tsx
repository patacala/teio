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
    <div className="bg-panel border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
      </div>

      {isLoading ? (
        <div className="h-10 bg-gray-100 animate-pulse rounded" />
      ) : (
        <>
          <p className="text-2xl font-bold text-gray-900">{conversations.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">total conversations</p>
          {latest && (
            <div className="mt-3 text-xs text-gray-500">
              <span className="capitalize font-medium text-gray-700">{latest.channel}</span>
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

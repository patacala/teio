'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ConversationListPanel } from '@/components/inbox/conversation-list-panel';
import { ConversationViewPanel } from '@/components/inbox/conversation-view-panel';
import { ContactSidebar } from '@/components/inbox/contact-sidebar';
import { useConversation } from '@/hooks/useConversations';

function InboxInner({ selectedId }: { selectedId: string | null }) {
  const { data: conversation } = useConversation(selectedId);
  return (
    <ContactSidebar
      contactId={conversation?.contact_id ?? null}
      conversationId={selectedId}
    />
  );
}

function InboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get('conversationId') || null;

  const onSelect = useCallback(
    (id: string) => {
      router.replace(`/inbox?conversationId=${id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div
      className="flex h-full"
      style={{ margin: '-24px', height: 'calc(100vh - 64px)' }}
    >
      <ConversationListPanel selectedId={selectedId} onSelect={onSelect} />
      <ConversationViewPanel conversationId={selectedId} />
      <InboxInner selectedId={selectedId} />
    </div>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxContent />
    </Suspense>
  );
}

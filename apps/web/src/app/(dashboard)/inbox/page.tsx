'use client';

import { Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Inbox as InboxIcon, Columns3, Users, Phone } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConversationListPanel } from '@/components/inbox/conversation-list-panel';
import { ConversationViewPanel } from '@/components/inbox/conversation-view-panel';
import { ContactSidebar } from '@/components/inbox/contact-sidebar';
import { PipelineView } from '@/components/inbox/pipeline-view';
import { ContactsView } from '@/components/inbox/contacts-view';
import { CallsView } from '@/components/inbox/calls-view';
import { useConversation } from '@/hooks/useConversations';

function InboxInner({ selectedId, leadId }: { selectedId: string | null; leadId: string | null }) {
  const { data: conversation } = useConversation(selectedId);
  return (
    <ContactSidebar
      contactId={conversation?.contact_id ?? leadId}
      conversationId={selectedId}
    />
  );
}

function ConversationsTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const selectedId = searchParams.get('conversationId') || null;
  const leadId = searchParams.get('lead') || null;

  const onSelect = useCallback(
    (id: string) => {
      router.replace(`/inbox?conversationId=${id}`, { scroll: false });
    },
    [router],
  );

  return (
    <div className="panel-card flex h-full min-h-0 overflow-hidden">
      <ConversationListPanel selectedId={selectedId} onSelect={onSelect} />
      <ConversationViewPanel conversationId={selectedId} />
      <InboxInner selectedId={selectedId} leadId={leadId} />
    </div>
  );
}

function InboxContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') || 'conversations';

  const setTab = useCallback(
    (next: string) => {
      router.replace(next === 'conversations' ? '/inbox' : `/inbox?tab=${next}`, { scroll: false });
    },
    [router],
  );

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col gap-3">
      <TabsList>
        <TabsTrigger value="conversations">
          <InboxIcon className="h-3.5 w-3.5" /> Conversations
        </TabsTrigger>
        <TabsTrigger value="pipeline">
          <Columns3 className="h-3.5 w-3.5" /> Pipeline
        </TabsTrigger>
        <TabsTrigger value="contacts">
          <Users className="h-3.5 w-3.5" /> Contacts
        </TabsTrigger>
        <TabsTrigger value="calls">
          <Phone className="h-3.5 w-3.5" /> Calls
        </TabsTrigger>
      </TabsList>

      <TabsContent value="conversations" className="min-h-0 flex-1">
        <ConversationsTab />
      </TabsContent>
      <TabsContent value="pipeline" className="min-h-0 flex-1 overflow-y-auto">
        <PipelineView />
      </TabsContent>
      <TabsContent value="contacts" className="min-h-0 flex-1 overflow-y-auto">
        <ContactsView />
      </TabsContent>
      <TabsContent value="calls" className="min-h-0 flex-1 overflow-y-auto">
        <CallsView />
      </TabsContent>
    </Tabs>
  );
}

export default function InboxPage() {
  return (
    <Suspense>
      <InboxContent />
    </Suspense>
  );
}

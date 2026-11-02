'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useContact, useAllFunnelStages } from '@/hooks/useContacts';

import { ContactHeader } from './_components/ContactHeader';
import { ContactInfoCard } from './_components/ContactInfoCard';
import { CapturedDataCard } from './_components/CapturedDataCard';
import { ConversationsSummaryCard } from './_components/ConversationsSummaryCard';
import { VoiceCallsSummaryCard } from './_components/VoiceCallsSummaryCard';
import { LeadScoreCard } from './_components/LeadScoreCard';
import { FunnelStageCard } from './_components/FunnelStageCard';
import { FollowUpCard } from './_components/FollowUpCard';
import { HandlingModeCard } from './_components/HandlingModeCard';
import { TagsCard } from './_components/TagsCard';
import { AppointmentsCard } from './_components/AppointmentsCard';
import { ActivityTimeline } from './_components/ActivityTimeline';

export default function ContactProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [editMode, setEditMode] = useState(false);

  const { data: contact, isLoading, isError } = useContact(id);
  const { data: stages = [] } = useAllFunnelStages();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError || !contact) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm text-gray-500">Contact not found</p>
        <button
          onClick={() => router.push('/contacts')}
          className="text-sm text-blue-600 hover:underline"
        >
          Back to contacts
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-none px-6 py-6 space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push('/contacts')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Contacts
      </button>

      {/* Header */}
      <ContactHeader
        contact={contact}
        onEdit={() => setEditMode((v) => !v)}
        stages={stages}
      />

      {/* 3-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-5">
          <ContactInfoCard
            contact={contact}
            editMode={editMode}
            onEditToggle={setEditMode}
          />
          <CapturedDataCard contact={contact} />
          <ConversationsSummaryCard contactId={id} />
          <VoiceCallsSummaryCard contactId={id} />
        </div>

        {/* Middle column */}
        <div className="space-y-5">
          <LeadScoreCard contact={contact} />
          <FunnelStageCard contact={contact} />
          <FollowUpCard contactId={id} />
          <HandlingModeCard contact={contact} />
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <TagsCard contact={contact} />
          <AppointmentsCard contactId={id} />
        </div>

        {/* Full-width timeline */}
        <ActivityTimeline contactId={id} />
      </div>
    </div>
  );
}

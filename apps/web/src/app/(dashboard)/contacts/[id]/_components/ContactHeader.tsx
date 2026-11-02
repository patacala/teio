'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MessageSquare, Edit2 } from 'lucide-react';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
  onEdit: () => void;
}

function getInitials(contact: Contact) {
  return `${contact.first_name?.[0] ?? ''}${contact.last_name?.[0] ?? ''}`.toUpperCase();
}

function getStageName(contact: Contact, stages: { id: string; name: string }[]) {
  if (!contact.lead_stage) return null;
  return stages.find((s) => s.id === contact.lead_stage)?.name ?? null;
}

export function ContactHeader({
  contact,
  onEdit,
  stages = [],
}: Props & { stages?: { id: string; name: string }[] }) {
  const router = useRouter();

  return (
    <div className="flex items-start justify-between gap-4 bg-panel border border-border rounded-xl p-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xl font-bold shrink-0">
          {getInitials(contact)}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {contact.first_name} {contact.last_name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            {contact.phone && <span>{contact.phone}</span>}
            {contact.email && contact.phone && <span>·</span>}
            {contact.email && <span>{contact.email}</span>}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {contact.lead_score !== undefined && (
              <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
                Score: {contact.lead_score}
              </span>
            )}
            {contact.lead_stage && (() => {
              const name = getStageName(contact, stages);
              return name ? (
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700">
                  {name}
                </span>
              ) : null;
            })()}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Edit2 className="h-4 w-4 mr-1.5" />
          Edit
        </Button>
        <Button
          size="sm"
          onClick={() => router.push(`/inbox?contactId=${contact.id}`)}
        >
          <MessageSquare className="h-4 w-4 mr-1.5" />
          Open Conversation
        </Button>
      </div>
    </div>
  );
}

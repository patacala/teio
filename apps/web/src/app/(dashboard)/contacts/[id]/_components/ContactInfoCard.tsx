'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Save, X } from 'lucide-react';
import { useUpdateContact } from '@/hooks/useContacts';
import { toast } from '@/hooks/useToast';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
  editMode: boolean;
  onEditToggle: (v: boolean) => void;
}

export function ContactInfoCard({ contact, editMode, onEditToggle }: Props) {
  const [form, setForm] = useState({
    first_name: contact.first_name,
    last_name: contact.last_name ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
  });

  const update = useUpdateContact();

  const handleSave = () => {
    update.mutate(
      { id: contact.id, body: form },
      {
        onSuccess: () => {
          toast({ title: 'Contact updated', variant: 'default' });
          onEditToggle(false);
        },
        onError: () => toast({ title: 'Failed to update contact', variant: 'error' }),
      },
    );
  };

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-primary">Contact Info</h3>
        {!editMode ? (
          <button
            onClick={() => onEditToggle(true)}
            className="text-muted hover:text-secondary"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button onClick={handleSave} className="text-accent hover:text-accent-hover">
              <Save className="h-4 w-4" />
            </button>
            <button onClick={() => onEditToggle(false)} className="text-muted hover:text-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {editMode ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-secondary mb-1">First name</p>
              <Input
                value={form.first_name}
                onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <p className="text-xs text-secondary mb-1">Last name</p>
              <Input
                value={form.last_name}
                onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-secondary mb-1">Email</p>
            <Input
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <p className="text-xs text-secondary mb-1">Phone</p>
            <Input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={update.isPending} className="w-full">
            Save Changes
          </Button>
        </div>
      ) : (
        <dl className="space-y-2">
          <Row label="First name" value={contact.first_name} />
          <Row label="Last name" value={contact.last_name || '—'} />
          <Row label="Email" value={contact.email || '—'} />
          <Row label="Phone" value={contact.phone || '—'} />
          <Row
            label="Created"
            value={new Date(contact.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <dt className="text-secondary">{label}</dt>
      <dd className="text-primary font-medium text-right">{value}</dd>
    </div>
  );
}

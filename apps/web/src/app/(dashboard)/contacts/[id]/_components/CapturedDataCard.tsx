'use client';

import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

function capitalize(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CapturedDataCard({ contact }: Props) {
  const fields = contact.custom_fields as Record<string, string> | null | undefined;
  const entries = fields ? Object.entries(fields) : [];

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <h3 className="text-sm font-semibold text-primary mb-4">Captured Data</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No captured data yet</p>
      ) : (
        <dl className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <dt className="text-secondary">{capitalize(key)}</dt>
              <dd className="text-primary font-medium text-right max-w-[60%] truncate">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

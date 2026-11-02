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
    <div className="bg-panel border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Captured Data</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">No captured data yet</p>
      ) : (
        <dl className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm">
              <dt className="text-gray-500">{capitalize(key)}</dt>
              <dd className="text-gray-900 font-medium text-right max-w-[60%] truncate">
                {String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

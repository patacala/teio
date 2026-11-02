'use client';

import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function LeadScoreCard({ contact }: Props) {
  const score = contact.lead_score ?? 0;

  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Lead Score</h3>
      <div className="flex items-end justify-between mb-2">
        <p className="text-3xl font-bold text-gray-900">{score}</p>
        <p className="text-sm text-gray-500">/ 100</p>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-2 bg-blue-600 rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2">
        {score >= 70 ? 'High potential' : score >= 40 ? 'Medium potential' : 'Low potential'}
      </p>
    </div>
  );
}

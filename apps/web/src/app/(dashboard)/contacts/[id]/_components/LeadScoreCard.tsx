'use client';

import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function LeadScoreCard({ contact }: Props) {
  const score = contact.lead_score ?? 0;

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <h3 className="text-sm font-semibold text-primary mb-4">Lead Score</h3>
      <div className="flex items-end justify-between mb-2">
        <p className="text-3xl font-bold text-primary">{score}</p>
        <p className="text-sm text-secondary">/ 100</p>
      </div>
      <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
        <div
          className="h-2 bg-accent rounded-full transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-muted mt-2">
        {score >= 70 ? 'High potential' : score >= 40 ? 'Medium potential' : 'Low potential'}
      </p>
    </div>
  );
}

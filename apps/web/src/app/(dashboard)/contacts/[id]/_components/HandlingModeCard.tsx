'use client';

import { Bot, User } from 'lucide-react';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function HandlingModeCard({ contact }: Props) {
  const isAI = contact.handled_by === 'ai';

  return (
    <div className="bg-surface border border-subtle rounded-xl p-5">
      <h3 className="text-sm font-semibold text-primary mb-4">Handling Mode</h3>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            isAI ? 'bg-olive-dark text-accent' : 'bg-surface-raised text-primary'
          }`}
        >
          {isAI ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm font-medium text-primary">{isAI ? 'AI' : 'Human'}</p>
          <p className="text-xs text-secondary">{isAI ? 'Automated responses' : 'Manual responses'}</p>
        </div>
      </div>
    </div>
  );
}

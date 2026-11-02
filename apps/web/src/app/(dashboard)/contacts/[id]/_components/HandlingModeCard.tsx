'use client';

import { Bot, User } from 'lucide-react';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function HandlingModeCard({ contact }: Props) {
  const isAI = contact.handled_by === 'ai';

  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Handling Mode</h3>
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full ${
            isAI ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'
          }`}
        >
          {isAI ? <Bot className="h-5 w-5" /> : <User className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{isAI ? 'AI' : 'Human'}</p>
          <p className="text-xs text-gray-500">{isAI ? 'Automated responses' : 'Manual responses'}</p>
        </div>
      </div>
    </div>
  );
}

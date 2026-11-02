'use client';

import { useState, KeyboardEvent } from 'react';
import { Tag, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useAddTag, useRemoveTag } from '@/hooks/useContacts';
import { toast } from '@/hooks/useToast';
import type { Contact } from '@/services/contacts.service';

interface Props {
  contact: Contact;
}

export function TagsCard({ contact }: Props) {
  const [input, setInput] = useState('');
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  const tags = contact.tags ?? [];

  const handleAdd = () => {
    const tag = input.trim();
    if (!tag || tags.includes(tag)) return;
    addTag.mutate(
      { contactId: contact.id, tag },
      {
        onSuccess: () => setInput(''),
        onError: () => toast({ title: 'Failed to add tag', variant: 'error' }),
      },
    );
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <div className="bg-panel border border-border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Tag className="h-4 w-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-900">Tags</h3>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {tags.length === 0 && (
          <p className="text-xs text-gray-400">No tags yet</p>
        )}
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700"
          >
            {tag}
            <button
              onClick={() =>
                removeTag.mutate(
                  { contactId: contact.id, tagId: tag },
                  { onError: () => toast({ title: 'Failed to remove tag', variant: 'error' }) },
                )
              }
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add tag…"
          className="h-8 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim() || addTag.isPending}
          className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

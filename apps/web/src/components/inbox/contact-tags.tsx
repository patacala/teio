'use client';

import { useState, useRef } from 'react';
import { useAddTag, useRemoveTag } from '@/hooks/useContacts';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface ContactTagsProps {
  contactId: string;
  tags: string[];
}

export function ContactTags({ contactId, tags }: ContactTagsProps) {
  const [newTag, setNewTag] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const addTag = useAddTag();
  const removeTag = useRemoveTag();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const tag = newTag.trim();
      if (!tag) return;
      addTag.mutate({ contactId, tag });
      setNewTag('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge
            key={tag}
            variant="secondary"
            className="text-[10px] gap-1 pr-1"
          >
            {tag}
            <button
              onClick={() => removeTag.mutate({ contactId, tagId: tag })}
              className="hover:text-red-500 transition-colors"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        ref={inputRef}
        placeholder="Add tag…"
        value={newTag}
        onChange={(e) => setNewTag(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-6 text-xs px-2"
        disabled={addTag.isPending}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useTemplates } from '@/hooks/useTemplates';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText } from 'lucide-react';

interface TemplateSelectorProps {
  channel: string;
  onSelect: (content: string) => void;
}

export function TemplateSelector({ channel, onSelect }: TemplateSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: templates = [] } = useTemplates(channel);

  const filtered = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (content: string) => {
    onSelect(content);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="end" side="top">
        <Input
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
          autoFocus
        />
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted text-center py-3">No templates found</p>
          ) : (
            filtered.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelect(t.content)}
                className="w-full text-left rounded-md px-2 py-1.5 hover:bg-surface-raised transition-colors"
              >
                <p className="text-xs font-medium text-primary">{t.name}</p>
                <p className="text-[11px] text-muted truncate">{t.content}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

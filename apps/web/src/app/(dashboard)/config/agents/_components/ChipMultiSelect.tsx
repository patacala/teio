'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';

/** Multi-select as clickable chips, plus a free-text "add custom" input for
 * anything not in the preset list. Built for non-technical users — no
 * typing required for the common cases, but nothing is locked down. */
export function ChipMultiSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [customText, setCustomText] = useState('');

  const toggle = (option: string) => {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  };

  const addCustom = () => {
    const trimmed = customText.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setCustomText('');
  };

  // Custom entries the user already added that aren't in the preset list —
  // shown as chips too, so they're visible and removable like any other.
  const customSelected = value.filter((v) => !options.includes(v));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                selected
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-border hover:border-gray-400'
              }`}
            >
              {option}
            </button>
          );
        })}
        {customSelected.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            className="text-xs px-2.5 py-1 rounded-full border bg-blue-600 text-white border-blue-600"
          >
            {option} ×
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add your own…"
          className="h-8 text-xs max-w-[220px]"
        />
        <button
          type="button"
          onClick={addCustom}
          className="h-8 px-2 rounded-lg border border-border text-gray-500 hover:bg-gray-50 transition-colors"
          aria-label="Add"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

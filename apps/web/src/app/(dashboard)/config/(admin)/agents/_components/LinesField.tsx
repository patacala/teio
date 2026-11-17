'use client';

import { Textarea } from '@/components/ui/textarea';

/** Editable string[] as one item per line — used for principles/beliefs/
 * values/traits/instructions, all of which are flat lists of short phrases. */
export function LinesField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-primary mb-1.5">{label}</label>
      <Textarea
        rows={4}
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').filter((l) => l.trim() !== ''))}
        placeholder={placeholder ?? 'One per line…'} className="font-mono"
      />
    </div>
  );
}

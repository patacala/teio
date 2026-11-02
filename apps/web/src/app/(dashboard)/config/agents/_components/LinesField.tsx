'use client';

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
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <textarea
        rows={4}
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n').filter((l) => l.trim() !== ''))}
        placeholder={placeholder ?? 'One per line…'}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
      />
    </div>
  );
}

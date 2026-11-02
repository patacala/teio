'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { useUpdateQualification } from '@/hooks/useAIAgents';
import { toast } from '@/hooks/useToast';
import type { BantDimension, QualificationField } from '@/services/ai-agents.service';

const FIELD_TYPES: QualificationField['type'][] = [
  'text', 'number', 'email', 'phone', 'boolean', 'enum', 'date',
];

const BANT_OPTIONS: { value: BantDimension | ''; label: string }[] = [
  { value: '', label: 'None' },
  { value: 'need', label: 'Need' },
  { value: 'budget', label: 'Budget' },
  { value: 'authority', label: 'Authority' },
  { value: 'timeline', label: 'Timeline' },
];

function newField(): QualificationField {
  return {
    key: '',
    label: '',
    type: 'text',
    options: [],
    ask_priority: 'normal',
    required_for_scheduling: false,
    crm_field: '',
    sticky: false,
    enabled: true,
    bant_dimension: null,
  };
}

/**
 * Defines WHAT the agent captures from each lead: which fields, which to ask for
 * first, and which are required before it can book. Simple by default (label +
 * two toggles); the technical controls (type, CRM mapping, BANT scoring, sticky)
 * live behind Expert mode. The internal `key` is never shown — it's derived from
 * the label on save.
 */
export function QualificationTab({
  fields,
  expertMode = false,
}: {
  fields: QualificationField[];
  expertMode?: boolean;
}) {
  const [rows, setRows] = useState<QualificationField[]>(fields ?? []);
  const update = useUpdateQualification();

  useEffect(() => setRows(fields ?? []), [fields]);

  const patch = (i: number, p: Partial<QualificationField>) =>
    setRows((r) => r.map((f, idx) => (idx === i ? { ...f, ...p } : f)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const add = () => setRows((r) => [...r, newField()]);

  const handleSave = async () => {
    // Drop empty rows; derive a key from the label if the user didn't set one.
    const clean = rows
      .filter((f) => f.label.trim() || f.key.trim())
      .map((f) => ({
        ...f,
        key: (f.key || f.label).trim().toLowerCase().replace(/\s+/g, '_'),
        crm_field: f.crm_field.trim(),
      }));
    try {
      await update.mutateAsync(clean);
      toast({ title: 'Qualification fields saved', variant: 'default' });
    } catch {
      toast({ title: 'Failed to save fields', variant: 'error' });
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-xs text-gray-500">
        The data the agent should collect from each lead.{' '}
        <span className="font-medium">Ask first</span> fields (like name) are
        requested right away; <span className="font-medium">Required to book</span>{' '}
        fields must be collected before the agent can schedule an appointment.
      </p>

      <div className="space-y-3">
        {rows.map((f, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={f.label}
                onChange={(e) => patch(i, { label: e.target.value })}
                placeholder="What to capture (e.g. Name, Email, Budget)"
                className="flex-1"
              />
              {expertMode && (
                <select
                  value={f.type}
                  onChange={(e) => patch(i, { type: e.target.value as QualificationField['type'] })}
                  className="rounded-md border border-border bg-white px-2 py-1.5 text-sm text-gray-800"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                className="shrink-0 text-gray-400 hover:text-red-500"
                aria-label="Remove field"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={f.ask_priority === 'early'}
                  onChange={(e) => patch(i, { ask_priority: e.target.checked ? 'early' : 'normal' })}
                />
                Ask first
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={f.required_for_scheduling}
                  onChange={(e) => patch(i, { required_for_scheduling: e.target.checked })}
                />
                Required to book
              </label>
            </div>

            {expertMode && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={f.sticky}
                      onChange={(e) => patch(i, { sticky: e.target.checked })}
                    />
                    Don&apos;t overwrite once set
                  </label>
                  <label className="flex items-center gap-1.5">
                    Scores (BANT):
                    <select
                      value={f.bant_dimension ?? ''}
                      onChange={(e) =>
                        patch(i, { bant_dimension: (e.target.value || null) as BantDimension | null })
                      }
                      className="rounded-md border border-border bg-white px-2 py-1 text-xs text-gray-800"
                    >
                      {BANT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {f.type === 'enum' && (
                  <Input
                    value={f.options.join(', ')}
                    onChange={(e) =>
                      patch(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })
                    }
                    placeholder="Options, comma-separated (e.g. cuotas, total)"
                  />
                )}

                <Input
                  value={f.crm_field}
                  onChange={(e) => patch(i, { crm_field: e.target.value })}
                  placeholder="CRM field to map to (leave blank to use the field name)"
                  className="text-xs"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <Plus className="h-3.5 w-3.5" /> Add field
      </button>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={update.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

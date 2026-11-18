'use client';

import { useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import type { RecipientConfig, RecipientMode } from '@crm/shared';
import { ContactAutocomplete } from '@/components/agenda/contact-autocomplete';
import { useAudiencePreview } from '@/hooks/useAutomations';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import { conditionFields, ROLE_OPTIONS, triggerScope, type VariableOption } from '../automation-ui';
import { ConditionBuilder } from './ConditionBuilder';
import { Field, OptionSelect, TemplateField } from './fields';
import { cn } from '@/lib/utils';

const MODE_LABELS: Record<RecipientMode, string> = {
  run_contact: 'The contact of this automation',
  filter: 'Contacts matching a filter',
  contacts: 'Specific contacts',
  team: 'Team members',
  custom: 'A phone number or email',
};

interface Props {
  value: RecipientConfig;
  onChange(value: RecipientConfig): void;
  modes: RecipientMode[];
  /** Scheduled automations have no contact of their own. */
  organizationRun: boolean;
  catalog?: AutomationOrgCatalog;
  variables: VariableOption[];
  disabled?: boolean;
  addressKind?: 'phone' | 'email or phone';
}

function AudienceCount({ filter }: { filter: RecipientConfig['filter'] }) {
  const { data, isFetching, error } = useAudiencePreview(filter ?? null);
  if (!filter?.any?.some((b) => b.all.length)) return null;
  if (error) return <p className="text-[11px] text-danger">{(error as Error).message}</p>;
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-secondary">
      {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Users className="h-3 w-3" />}
      {data ? `${data.count} contact${data.count === 1 ? '' : 's'} match right now` : 'Counting…'}
    </p>
  );
}

/** Who a messaging step sends to. */
export function RecipientsPicker({ value, onChange, modes, organizationRun, catalog, variables, disabled, addressKind = 'email or phone' }: Props) {
  const available = modes.filter((m) => !(organizationRun && m === 'run_contact'));
  const [labels, setLabels] = useState<Record<string, string>>({});
  const contactFields = conditionFields(triggerScope([]), catalog?.custom_fields ?? [], 'contact');

  return (
    <div className="space-y-3">
      <Field label="Send to">
        <OptionSelect
          ariaLabel="Send to"
          value={value.mode}
          disabled={disabled}
          onChange={(mode) => onChange({ mode: mode as RecipientMode })}
          options={available.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
        />
      </Field>

      {value.mode === 'filter' && (
        <div className="space-y-2">
          <ConditionBuilder
            value={value.filter}
            onChange={(filter) => onChange({ ...value, filter })}
            fields={contactFields}
            catalog={catalog}
            disabled={disabled}
            emptyLabel="Add a condition to choose the contacts."
          />
          <AudienceCount filter={value.filter} />
          <p className="text-[11px] text-muted">Each contact gets their own message; contacts who opted out are skipped.</p>
        </div>
      )}

      {value.mode === 'contacts' && (
        <div className="space-y-2">
          <ContactAutocomplete
            value={null}
            onChange={(id, label) => {
              if (!id || (value.contact_ids ?? []).includes(id)) return;
              setLabels((l) => ({ ...l, [id]: label }));
              onChange({ ...value, contact_ids: [...(value.contact_ids ?? []), id] });
            }}
          />
          <div className="flex flex-wrap gap-1">
            {(value.contact_ids ?? []).map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full border border-subtle px-2 py-0.5 text-[11px] text-secondary">
                {labels[id] ?? `${id.slice(0, 8)}…`}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label="Remove contact"
                  onClick={() => onChange({ ...value, contact_ids: (value.contact_ids ?? []).filter((c) => c !== id) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {value.mode === 'team' && (
        <div className="space-y-2">
          <Field label="Roles">
            <div className="flex flex-wrap gap-1">
              {ROLE_OPTIONS.map((r) => {
                const on = (value.team?.roles ?? []).includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => {
                      const roles = on ? (value.team?.roles ?? []).filter((x) => x !== r.value) : [...(value.team?.roles ?? []), r.value];
                      onChange({ ...value, team: { ...value.team, roles } });
                    }}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                      on ? 'border-accent bg-olive-dark text-accent' : 'border-subtle text-secondary hover:bg-surface-hover',
                    )}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Or specific people">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-subtle p-2">
              {(catalog?.users ?? []).map((u) => {
                const on = (value.team?.user_ids ?? []).includes(u.id);
                return (
                  <label key={u.id} className="flex items-center gap-2 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled}
                      onChange={() => {
                        const ids = on ? (value.team?.user_ids ?? []).filter((x) => x !== u.id) : [...(value.team?.user_ids ?? []), u.id];
                        onChange({ ...value, team: { ...value.team, user_ids: ids } });
                      }}
                    />
                    {u.full_name || u.email}
                  </label>
                );
              })}
            </div>
          </Field>
        </div>
      )}

      {value.mode === 'custom' && (
        <TemplateField
          label={addressKind === 'phone' ? 'Phone number' : 'Email or phone number'}
          value={value.address ?? ''}
          onChange={(address) => onChange({ ...value, address })}
          variables={variables}
          disabled={disabled}
          placeholder={addressKind === 'phone' ? '+15550001234' : 'team@example.com'}
        />
      )}
    </div>
  );
}

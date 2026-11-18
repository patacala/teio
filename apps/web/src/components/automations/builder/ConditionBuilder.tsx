'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  UNARY_OPERATORS,
  type AutomationFieldDef,
  type ConditionGroup,
  type ConditionOperator,
  type ConditionRule,
  type ConditionValue,
} from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import { operatorsFor } from '../automation-ui';

interface Props {
  value: ConditionGroup | undefined;
  onChange(value: ConditionGroup): void;
  fields: AutomationFieldDef[];
  catalog?: AutomationOrgCatalog;
  disabled?: boolean;
  /** Shown when there are no rules (e.g. "Every contact"). */
  emptyLabel?: string;
}

const LIST_OPERATORS: ConditionOperator[] = ['in', 'not_in', 'matches_keywords'];

function pickerOptions(field: AutomationFieldDef | undefined, catalog?: AutomationOrgCatalog): Array<{ value: string; label: string }> | null {
  if (!field) return null;
  if (field.options) return field.options;
  switch (field.picker) {
    case 'stage':
      return (catalog?.stages ?? []).map((s) => ({ value: s.id, label: s.funnel_name ? `${s.funnel_name} · ${s.name}` : s.name }));
    case 'user':
      return (catalog?.users ?? []).map((u) => ({ value: u.id, label: u.full_name || u.email }));
    case 'calendar':
      return (catalog?.calendars ?? []).map((c) => ({ value: c.id, label: c.name }));
    case 'service':
      return (catalog?.services ?? []).map((s) => ({ value: s.id, label: s.name }));
    default:
      return null;
  }
}

function toText(value: ConditionValue | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function splitList(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function ValueInput({ rule, field, catalog, disabled, onChange }: { rule: ConditionRule; field?: AutomationFieldDef; catalog?: AutomationOrgCatalog; disabled?: boolean; onChange(v: ConditionValue): void }) {
  const options = pickerOptions(field, catalog);
  const isList = LIST_OPERATORS.includes(rule.operator);
  // A list is typed as "a, b, c": keep the raw text so a trailing comma or space survives while typing.
  const [listText, setListText] = useState(toText(rule.value));
  useEffect(() => {
    setListText((current) => (toText(splitList(current)) === toText(rule.value) ? current : toText(rule.value)));
  }, [rule.value]);

  if (UNARY_OPERATORS.includes(rule.operator)) return null;

  if (options && !isList) {
    return (
      <Select value={toText(rule.value) || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 bg-surface text-xs" aria-label="Value">
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const numeric = field?.type === 'number' || rule.operator === 'older_than_days' || rule.operator === 'newer_than_days';
  const listId = field?.picker === 'tag' ? 'automation-tag-options' : undefined;
  return (
    <>
      <Input
        aria-label="Value"
        list={listId}
        type={numeric && !isList ? 'number' : 'text'}
        disabled={disabled}
        value={isList ? listText : toText(rule.value)}
        placeholder={isList ? (options ? options.map((o) => o.value).slice(0, 3).join(', ') : 'word, another word') : numeric ? (rule.operator.endsWith('_days') ? 'days' : '0') : 'value'}
        onChange={(e) => {
          const raw = e.target.value;
          if (isList) {
            setListText(raw);
            onChange(splitList(raw));
          }
          else if (numeric) onChange(raw === '' ? '' : Number(raw));
          else onChange(raw);
        }}
        className="h-8 bg-surface text-xs"
      />
      {listId && (
        <datalist id={listId}>
          {(catalog?.tags ?? []).map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      )}
    </>
  );
}

/**
 * Conditions as "any of these groups, where every rule in the group is true".
 * Rendered as groups separated by OR, rules within a group joined by AND.
 */
export function ConditionBuilder({ value, onChange, fields, catalog, disabled, emptyLabel }: Props) {
  const group: ConditionGroup = value?.any?.length ? value : { any: [] };
  const byPath = new Map(fields.map((f) => [f.path, f]));

  const setBlocks = (any: ConditionGroup['any']) => onChange({ any });
  const updateRule = (bi: number, ri: number, patch: Partial<ConditionRule>) =>
    setBlocks(group.any.map((b, i) => (i === bi ? { all: b.all.map((r, j) => (j === ri ? { ...r, ...patch } : r)) } : b)));
  const removeRule = (bi: number, ri: number) =>
    onChange({ any: group.any.map((b, i) => (i === bi ? { all: b.all.filter((_, j) => j !== ri) } : b)).filter((b) => b.all.length > 0) });
  const newRule = (): ConditionRule => {
    const field = fields[0];
    return { field: field?.path ?? '', operator: operatorsFor(field)[0]?.value ?? 'equals', value: '' };
  };
  const addRule = (bi: number) => setBlocks(group.any.map((b, i) => (i === bi ? { all: [...b.all, newRule()] } : b)));
  const addBlock = () => onChange({ any: [...group.any.filter((b) => b.all.length), { all: [newRule()] }] });

  return (
    <div className="space-y-2">
      {group.any.length === 0 && <p className="text-[11px] text-muted">{emptyLabel ?? 'No conditions.'}</p>}
      {group.any.map((block, bi) => (
        <div key={bi}>
          {bi > 0 && <p className="my-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">or</p>}
          <div className="space-y-2 rounded-xl border border-subtle bg-surface-raised p-2.5">
            {block.all.map((rule, ri) => {
              const field = byPath.get(rule.field);
              return (
                <div key={ri} className="space-y-1.5">
                  {ri > 0 && <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">and</p>}
                  <div className="grid grid-cols-[1fr_auto] gap-1.5">
                    <Select
                      value={rule.field || undefined}
                      disabled={disabled}
                      onValueChange={(path) => {
                        const f = byPath.get(path);
                        updateRule(bi, ri, { field: path, operator: operatorsFor(f)[0]?.value ?? 'equals', value: '' });
                      }}
                    >
                      <SelectTrigger className="h-8 bg-surface text-xs" aria-label="Field">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.path} value={f.path}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeRule(bi, ri)}
                      className="rounded-md p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      aria-label="Remove condition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Select value={rule.operator} disabled={disabled} onValueChange={(op) => updateRule(bi, ri, { operator: op as ConditionOperator, value: UNARY_OPERATORS.includes(op as ConditionOperator) ? undefined : rule.value })}>
                      <SelectTrigger className="h-8 bg-surface text-xs" aria-label="Comparison">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {operatorsFor(field).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <ValueInput rule={rule} field={field} catalog={catalog} disabled={disabled} onChange={(v) => updateRule(bi, ri, { value: v })} />
                  </div>
                </div>
              );
            })}
            <button type="button" disabled={disabled} onClick={() => addRule(bi)} className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40">
              + And
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" disabled={disabled || !fields.length} onClick={addBlock} className="w-full gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        {group.any.length ? 'Or another group' : 'Add condition'}
      </Button>
    </div>
  );
}

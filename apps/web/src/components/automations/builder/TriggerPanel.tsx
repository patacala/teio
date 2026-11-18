'use client';

import { Plus, Trash2 } from 'lucide-react';
import {
  TRIGGER_CATALOG,
  type AutomationSettings,
  type AutomationTrigger,
  type EventTriggerKey,
  type ScheduleSpec,
  type TriggerKey,
} from '@crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import { TRIGGER_CATEGORY_LABELS, conditionFields, triggerScope, WAITABLE_TRIGGERS } from '../automation-ui';
import { ConditionBuilder } from './ConditionBuilder';
import { Field, OptionSelect, WeekdayPicker } from './fields';

const CATEGORIES = [...new Set(TRIGGER_CATALOG.map((t) => t.category))];

function TriggerSelect({ value, onChange, disabled, exclude }: { value: string; onChange(key: TriggerKey): void; disabled?: boolean; exclude: string[] }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TriggerKey)} disabled={disabled}>
      <SelectTrigger className="bg-surface" aria-label="Trigger">
        <SelectValue placeholder="What starts it?" />
      </SelectTrigger>
      <SelectContent>
        {CATEGORIES.map((category) => (
          <SelectGroup key={category}>
            <SelectLabel>{TRIGGER_CATEGORY_LABELS[category]}</SelectLabel>
            {TRIGGER_CATALOG.filter((t) => t.category === category && (t.key === value || !exclude.includes(t.key))).map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ScheduleEditor({ value, onChange, disabled }: { value: ScheduleSpec; onChange(s: ScheduleSpec): void; disabled?: boolean }) {
  return (
    <div className="space-y-3">
      <Field label="Repeats">
        <OptionSelect
          ariaLabel="Repeats"
          value={value.frequency}
          disabled={disabled}
          onChange={(frequency) => onChange({ ...value, frequency: frequency as ScheduleSpec['frequency'] })}
          options={[
            { value: 'once', label: 'Once' },
            { value: 'daily', label: 'Every day' },
            { value: 'weekly', label: 'Every week' },
            { value: 'monthly', label: 'Every month' },
          ]}
        />
      </Field>
      {value.frequency === 'once' && (
        <Field label="Date" htmlFor="schedule-date">
          <Input id="schedule-date" type="date" value={value.date ?? ''} disabled={disabled} onChange={(e) => onChange({ ...value, date: e.target.value })} className="w-44 bg-surface" />
        </Field>
      )}
      {value.frequency === 'weekly' && (
        <Field label="On">
          <WeekdayPicker value={value.days_of_week ?? []} onChange={(days_of_week) => onChange({ ...value, days_of_week })} disabled={disabled} />
        </Field>
      )}
      {value.frequency === 'monthly' && (
        <Field label="Day of the month" htmlFor="schedule-dom" hint="Months shorter than that day run on their last day.">
          <Input id="schedule-dom" type="number" min={1} max={31} value={value.day_of_month ?? 1} disabled={disabled} onChange={(e) => onChange({ ...value, day_of_month: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} className="w-24 bg-surface" />
        </Field>
      )}
      <Field label="At" htmlFor="schedule-time" hint="In the organization time zone.">
        <Input id="schedule-time" type="time" value={value.time} disabled={disabled} onChange={(e) => onChange({ ...value, time: e.target.value })} className="w-36 bg-surface" />
      </Field>
      <p className="text-[11px] text-muted">A scheduled automation runs once for the whole organization: its steps choose who receives messages.</p>
    </div>
  );
}

export function TriggerPanel({ triggers, onChange, catalog, disabled }: { triggers: AutomationTrigger[]; onChange(t: AutomationTrigger[]): void; catalog?: AutomationOrgCatalog; disabled?: boolean }) {
  const isSchedule = triggers.some((t) => t.key === 'schedule');
  const replace = (i: number, key: TriggerKey) =>
    onChange(
      key === 'schedule'
        ? [{ key: 'schedule', schedule: { frequency: 'weekly', time: '09:00', days_of_week: [1] } }]
        : triggers
            .map((t, j): AutomationTrigger => (j === i ? (key === 'manual' ? { key: 'manual' } : { key: key as EventTriggerKey }) : t))
            .filter((t) => t.key !== 'schedule'),
    );

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">The automation starts when any of these happens.</p>
      {triggers.map((trigger, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-subtle bg-surface-raised p-3">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <TriggerSelect value={trigger.key} onChange={(key) => replace(i, key)} disabled={disabled} exclude={triggers.map((t) => t.key)} />
            <button type="button" aria-label="Remove trigger" disabled={disabled} onClick={() => onChange(triggers.filter((_, j) => j !== i))} className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-muted">{TRIGGER_CATALOG.find((t) => t.key === trigger.key)?.description}</p>
          {trigger.key === 'schedule' && (
            <ScheduleEditor value={trigger.schedule} onChange={(schedule) => onChange([{ key: 'schedule', schedule }])} disabled={disabled} />
          )}
          {trigger.key !== 'schedule' && trigger.key !== 'manual' && (
            <Field label="Only when">
              <ConditionBuilder
                value={'filters' in trigger ? trigger.filters : undefined}
                onChange={(filters) => onChange(triggers.map((t, j) => (j === i ? { ...(t as { key: EventTriggerKey }), filters } : t)))}
                fields={conditionFields(triggerScope([trigger]), catalog?.custom_fields ?? [])}
                catalog={catalog}
                disabled={disabled}
                emptyLabel="Every time."
              />
            </Field>
          )}
        </div>
      ))}
      {!isSchedule && (
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-full gap-1.5" onClick={() => onChange([...triggers, { key: 'message.received' }])}>
          <Plus className="h-3.5 w-3.5" />
          {triggers.length ? 'Another trigger' : 'Add a trigger'}
        </Button>
      )}
    </div>
  );
}

function SettingToggle({ label, hint, checked, onChange, disabled }: { label: string; hint: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-xs font-medium text-primary">{label}</span>
        <span className="block text-[11px] text-muted">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

export function SettingsPanel({
  settings,
  triggers,
  onChange,
  catalog,
  disabled,
}: {
  settings: AutomationSettings;
  triggers: AutomationTrigger[];
  onChange(s: AutomationSettings): void;
  catalog?: AutomationOrgCatalog;
  disabled?: boolean;
}) {
  const set = (patch: Partial<AutomationSettings>) => onChange({ ...settings, ...patch });
  const organizationRun = triggers.some((t) => t.key === 'schedule');
  return (
    <div className="space-y-5">
      {!organizationRun && (
        <>
          <SettingToggle
            label="Let contacts go through it again"
            hint="When off, a contact goes through this automation only once, ever."
            checked={settings.reentry === 'after_finish'}
            onChange={(v) => set({ reentry: v ? 'after_finish' : 'never' })}
            disabled={disabled}
          />
          <SettingToggle
            label="Several at once"
            hint="Let a contact be in it several times at the same time (e.g. one run per message or per appointment)."
            checked={!!settings.allow_parallel_runs}
            onChange={(allow_parallel_runs) => set({ allow_parallel_runs })}
            disabled={disabled}
          />
        </>
      )}
      <SettingToggle
        label="Skip contacts who opted out"
        hint='Contacts tagged "opt-out" get nothing from this automation. Turn off only for messages they must receive (e.g. bookings).'
        checked={settings.respect_opt_out}
        onChange={(respect_opt_out) => set({ respect_opt_out })}
        disabled={disabled}
      />
      <SettingToggle
        label="Send during business hours only"
        hint="Messages wait for the working days and hours of the follow-up calendar."
        checked={settings.send_window === 'business_hours'}
        onChange={(v) => set({ send_window: v ? 'business_hours' : 'anytime' })}
        disabled={disabled}
      />

      {!organizationRun && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-primary">Stop early when</p>
          <p className="text-[11px] text-muted">A contact in the middle of this automation leaves it when one of these happens.</p>
          {settings.exit_on.map((rule, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-subtle bg-surface-raised p-3">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <OptionSelect
                  ariaLabel="Stop when"
                  value={rule.trigger}
                  disabled={disabled}
                  onChange={(trigger) => set({ exit_on: settings.exit_on.map((r, j) => (j === i ? { trigger: trigger as EventTriggerKey } : r)) })}
                  options={WAITABLE_TRIGGERS.map((t) => ({ value: t.key, label: t.label }))}
                />
                <button type="button" aria-label="Remove exit rule" disabled={disabled} onClick={() => set({ exit_on: settings.exit_on.filter((_, j) => j !== i) })} className="rounded-md p-2 text-muted hover:bg-danger/10 hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <ConditionBuilder
                value={rule.filters}
                onChange={(filters) => set({ exit_on: settings.exit_on.map((r, j) => (j === i ? { ...r, filters } : r)) })}
                fields={conditionFields(triggerScope([{ key: rule.trigger }]), catalog?.custom_fields ?? []).filter((f) => f.path.startsWith('trigger.'))}
                catalog={catalog}
                disabled={disabled}
                emptyLabel="Any time it happens."
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-full gap-1.5" onClick={() => set({ exit_on: [...settings.exit_on, { trigger: 'message.received' }] })}>
            <Plus className="h-3.5 w-3.5" /> Add a reason to stop
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

import { Plus, X } from 'lucide-react';
import {
  NODE_CATALOG,
  type AutomationNode,
  type EmailContent,
  type NodeConfigMap,
  type NodeType,
  type RecipientMode,
  type TriggerKey,
} from '@crm/shared';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { AutomationOrgCatalog } from '@/services/automations.service';
import {
  CHANNEL_STRATEGY_OPTIONS,
  ROLE_OPTIONS,
  WAITABLE_TRIGGERS,
  availableVariables,
  conditionFields,
  triggerScope,
  type TriggerScope,
} from '../automation-ui';
import { ConditionBuilder } from './ConditionBuilder';
import { RecipientsPicker } from './RecipientsPicker';
import { DurationInput, Field, OptionSelect, TemplateField, WeekdayPicker } from './fields';
import { cn } from '@/lib/utils';

interface Props {
  node: AutomationNode;
  scope: TriggerScope;
  catalog?: AutomationOrgCatalog;
  disabled?: boolean;
  onChange(node: AutomationNode): void;
}

const RECIPIENT_MODES: Partial<Record<NodeType, RecipientMode[]>> = {
  send_message: ['run_contact', 'filter', 'contacts'],
  send_sms: ['run_contact', 'filter', 'contacts', 'custom'],
  send_email: ['run_contact', 'filter', 'contacts', 'team', 'custom'],
};

function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean; hint?: string }) {
  return (
    <label className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-xs font-medium text-primary">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </label>
  );
}

function StringList({ label, values, onChange, variables, disabled, addLabel }: { label: string; values: string[]; onChange(v: string[]): void; variables: ReturnType<typeof availableVariables>; disabled?: boolean; addLabel: string }) {
  return (
    <div className="space-y-2">
      {values.map((v, i) => (
        <div key={i} className="relative">
          <TemplateField label={`${label} ${values.length > 1 ? i + 1 : ''}`.trim()} value={v} multiline variables={variables} disabled={disabled} onChange={(text) => onChange(values.map((x, j) => (j === i ? text : x)))} />
          {values.length > 1 && (
            <button type="button" aria-label={`Remove ${label.toLowerCase()}`} disabled={disabled} onClick={() => onChange(values.filter((_, j) => j !== i))} className="absolute right-16 top-0 rounded p-0.5 text-muted hover:text-danger">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      <button type="button" disabled={disabled} onClick={() => onChange([...values, ''])} className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40">
        + {addLabel}
      </button>
    </div>
  );
}

function EmailEditor({ email, onChange, variables, disabled }: { email: EmailContent; onChange(e: EmailContent): void; variables: ReturnType<typeof availableVariables>; disabled?: boolean }) {
  const set = (patch: Partial<EmailContent>) => onChange({ ...email, ...patch });
  const links = email.links ?? [];
  return (
    <div className="space-y-3">
      <TemplateField label="Subject" value={email.subject} onChange={(subject) => set({ subject })} variables={variables} disabled={disabled} />
      <TemplateField label="Heading" value={email.heading} onChange={(heading) => set({ heading })} variables={variables} disabled={disabled} />
      <TemplateField label="Greeting" value={email.greeting ?? ''} onChange={(greeting) => set({ greeting: greeting || null })} variables={variables} disabled={disabled} hint="Leave empty for no greeting." />
      <StringList label="Paragraph" values={email.paragraphs.length ? email.paragraphs : ['']} onChange={(paragraphs) => set({ paragraphs })} variables={variables} disabled={disabled} addLabel="Paragraph" />
      <div className="grid grid-cols-2 gap-2">
        <TemplateField label="Button text" value={email.button?.label ?? ''} onChange={(label) => set({ button: label || email.button?.url ? { label, url: email.button?.url ?? '' } : undefined })} variables={variables} disabled={disabled} />
        <TemplateField label="Button link" value={email.button?.url ?? ''} onChange={(url) => set({ button: url || email.button?.label ? { label: email.button?.label ?? '', url } : undefined })} variables={variables} disabled={disabled} />
      </div>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <TemplateField label="Link text" value={l.label} onChange={(label) => set({ links: links.map((x, j) => (j === i ? { ...x, label } : x)) })} variables={variables} disabled={disabled} />
            <TemplateField label="Link" value={l.url} onChange={(url) => set({ links: links.map((x, j) => (j === i ? { ...x, url } : x)) })} variables={variables} disabled={disabled} />
            <button type="button" aria-label="Remove link" disabled={disabled} onClick={() => set({ links: links.filter((_, j) => j !== i) })} className="mb-2 rounded p-1 text-muted hover:text-danger">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" disabled={disabled} onClick={() => set({ links: [...links, { label: '', url: '' }] })} className="text-[11px] font-medium text-accent hover:underline disabled:opacity-40">
          + Link
        </button>
      </div>
      <StringList label="Note" values={email.notes ?? []} onChange={(notes) => set({ notes })} variables={variables} disabled={disabled} addLabel="Small print" />
      <TemplateField label="Footer" value={email.footer ?? ''} onChange={(footer) => set({ footer })} variables={variables} disabled={disabled} />
      <p className="text-[11px] text-muted">Parts whose variables are empty (a link without URL, a detail without value) are left out of the email.</p>
    </div>
  );
}

/** The settings form of the selected step. */
export function NodePanel({ node, scope, catalog, disabled, onChange }: Props) {
  const entry = NODE_CATALOG[node.type];
  const config = node.config as unknown as Record<string, unknown>;
  const set = <T extends NodeType>(patch: Partial<NodeConfigMap[T]>) => onChange({ ...node, config: { ...node.config, ...patch } as never });
  const recipients = (config.recipients as NodeConfigMap['send_sms']['recipients']) ?? { mode: 'run_contact' };
  const perRecipient = recipients.mode === 'filter' || recipients.mode === 'contacts';
  const variables = availableVariables(scope, catalog?.custom_fields ?? [], perRecipient);
  const modes = RECIPIENT_MODES[node.type];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-muted">{entry.description}</p>
      <Field label="Step name" htmlFor="node-label">
        <Input id="node-label" value={node.label ?? ''} placeholder={entry.label} disabled={disabled} onChange={(e) => onChange({ ...node, label: e.target.value || undefined })} className="bg-surface" />
      </Field>

      {modes && (
        <RecipientsPicker
          value={recipients}
          onChange={(r) => set({ recipients: r })}
          modes={modes}
          organizationRun={scope.organization}
          catalog={catalog}
          variables={variables}
          disabled={disabled}
          addressKind={node.type === 'send_sms' ? 'phone' : 'email or phone'}
        />
      )}

      {node.type === 'send_message' && (
        <>
          <Field label="Channel" hint={CHANNEL_STRATEGY_OPTIONS.find((o) => o.value === config.channel_strategy)?.hint}>
            <OptionSelect ariaLabel="Channel" value={config.channel_strategy as string} disabled={disabled} onChange={(v) => set({ channel_strategy: v as never })} options={CHANNEL_STRATEGY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
          </Field>
          <TemplateField label="Message" multiline value={(config.text as string) ?? ''} onChange={(text) => set({ text })} variables={variables} disabled={disabled} placeholder="Hi {{contact.first_name|there}}, …" hint="Use {{contact.first_name|there}} to fall back to a word when the value is empty." />
        </>
      )}

      {node.type === 'send_sms' && (
        <TemplateField label="Text" multiline value={(config.text as string) ?? ''} onChange={(text) => set({ text })} variables={variables} disabled={disabled} />
      )}

      {node.type === 'send_email' && (
        <>
          <EmailEditor email={config.email as EmailContent} onChange={(email) => set({ email })} variables={variables} disabled={disabled} />
          {scope.isAppointment && recipients.mode === 'run_contact' && (
            <Field label="Calendar invite">
              <OptionSelect
                ariaLabel="Calendar invite"
                value={(config.calendar_invite as string) ?? 'none'}
                disabled={disabled}
                onChange={(v) => set({ calendar_invite: v as never })}
                options={[
                  { value: 'none', label: 'None' },
                  { value: 'request', label: 'Add or update the appointment' },
                  { value: 'cancel', label: 'Remove the appointment (cancelled)' },
                ]}
              />
            </Field>
          )}
        </>
      )}

      {node.type === 'send_to_ai' && (
        <Field label="AI agent" hint="The AI receives the event (the message, the payment or the call) and answers the contact.">
          <OptionSelect
            ariaLabel="AI agent"
            value={(config.agent_id as string) || 'default'}
            disabled={disabled}
            onChange={(v) => set({ agent_id: v === 'default' ? null : v })}
            options={[{ value: 'default', label: 'The organization AI agent' }, ...(catalog?.ai_connections ?? []).map((a) => ({ value: a.id, label: a.name }))]}
          />
        </Field>
      )}

      {node.type === 'set_ai' && (
        <Toggle label="Let the AI answer this conversation" hint="Off: the AI stops and the team answers." checked={!!config.active} onChange={(active) => set({ active })} disabled={disabled} />
      )}

      {node.type === 'notify_team' && (
        <>
          <TemplateField label="Title" value={(config.title as string) ?? ''} onChange={(title) => set({ title })} variables={variables} disabled={disabled} />
          <TemplateField label="Details" multiline value={(config.description as string) ?? ''} onChange={(description) => set({ description })} variables={variables} disabled={disabled} />
          <Toggle label="Alert in the app" hint="Everyone in the organization sees it." checked={!!config.in_app} onChange={(in_app) => set({ in_app })} disabled={disabled} />
          <Field label="Also email">
            <div className="flex flex-wrap gap-1">
              {ROLE_OPTIONS.map((r) => {
                const roles = ((config.email_to as { roles?: string[] })?.roles ?? []) as string[];
                const on = roles.includes(r.value);
                return (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => set({ email_to: { ...(config.email_to as object), roles: on ? roles.filter((x) => x !== r.value) : [...roles, r.value] } })}
                    className={cn('rounded-full border px-2.5 py-1 text-[11px] font-medium', on ? 'border-accent bg-olive-dark text-accent' : 'border-subtle text-secondary hover:bg-surface-hover')}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </Field>
        </>
      )}

      {node.type === 'create_task' && (
        <>
          <TemplateField label="Task" value={(config.title as string) ?? ''} onChange={(title) => set({ title })} variables={variables} disabled={disabled} />
          <TemplateField label="Details" multiline value={(config.description as string) ?? ''} onChange={(description) => set({ description })} variables={variables} disabled={disabled} />
          <Field label="Due in">
            <DurationInput label="Due in" value={config.due_in as never} onChange={(due_in) => set({ due_in })} disabled={disabled} />
          </Field>
          <Toggle label="Wait until it is done" hint="The automation continues when someone marks the task done in the agenda." checked={!!config.wait_until_done} onChange={(wait_until_done) => set({ wait_until_done })} disabled={disabled} />
        </>
      )}

      {node.type === 'call' && (
        <TemplateField label="Message if the call cannot start" multiline value={(config.fallback_text as string) ?? ''} onChange={(fallback_text) => set({ fallback_text })} variables={variables} disabled={disabled} hint="Sent on the contact's chat channel when they have no phone or the call fails. Empty: the step fails." />
      )}

      {(node.type === 'add_tag' || node.type === 'remove_tag') && (
        <Field label="Tag" htmlFor="node-tag">
          <Input id="node-tag" list="node-tag-options" value={(config.tag as string) ?? ''} disabled={disabled} onChange={(e) => set({ tag: e.target.value })} className="bg-surface" />
          <datalist id="node-tag-options">
            {(catalog?.tags ?? []).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
      )}

      {node.type === 'update_contact' && (
        <div className="space-y-2">
          {((config.fields as Array<{ field: string; value: string }>) ?? []).map((f, i, all) => (
            <div key={i} className="space-y-1.5 rounded-xl border border-subtle bg-surface-raised p-2.5">
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <OptionSelect
                  ariaLabel="Contact field"
                  value={f.field}
                  disabled={disabled}
                  onChange={(field) => set({ fields: all.map((x, j) => (j === i ? { ...x, field } : x)) })}
                  options={[
                    { value: 'first_name', label: 'First name' },
                    { value: 'last_name', label: 'Last name' },
                    { value: 'email', label: 'Email' },
                    { value: 'phone', label: 'Phone' },
                    ...(catalog?.custom_fields ?? []).map((k) => ({ value: `custom.${k}`, label: `Captured: ${k}` })),
                  ]}
                />
                <button type="button" aria-label="Remove field" disabled={disabled || all.length === 1} onClick={() => set({ fields: all.filter((_, j) => j !== i) })} className="rounded p-1.5 text-muted hover:text-danger disabled:opacity-30">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <TemplateField label="Value" value={f.value} onChange={(value) => set({ fields: all.map((x, j) => (j === i ? { ...x, value } : x)) })} variables={variables} disabled={disabled} />
            </div>
          ))}
          <Field label="New captured field" hint="Type a key (letters, numbers, _) to create a captured field.">
            <Input
              placeholder="e.g. budget"
              disabled={disabled}
              className="bg-surface"
              onKeyDown={(e) => {
                const key = (e.target as HTMLInputElement).value.trim();
                if (e.key === 'Enter' && /^[a-zA-Z0-9_]{1,64}$/.test(key)) {
                  e.preventDefault();
                  set({ fields: [...((config.fields as Array<{ field: string; value: string }>) ?? []), { field: `custom.${key}`, value: '' }] });
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </Field>
          <Button type="button" variant="outline" size="sm" disabled={disabled} className="w-full gap-1.5" onClick={() => set({ fields: [...((config.fields as never[]) ?? []), { field: 'first_name', value: '' }] })}>
            <Plus className="h-3.5 w-3.5" /> Another field
          </Button>
        </div>
      )}

      {node.type === 'move_stage' && (
        <Field label="Stage">
          <OptionSelect ariaLabel="Stage" value={config.stage_id as string} disabled={disabled} onChange={(stage_id) => set({ stage_id })} options={(catalog?.stages ?? []).map((s) => ({ value: s.id, label: s.funnel_name ? `${s.funnel_name} · ${s.name}` : s.name }))} />
        </Field>
      )}

      {node.type === 'wait' && (
        <>
          <Field label="Wait">
            <OptionSelect ariaLabel="Wait mode" value={(config.mode as string) ?? 'duration'} disabled={disabled} onChange={(mode) => set({ mode: mode as never })} options={[{ value: 'duration', label: 'For some time' }, { value: 'until_time', label: 'Until a time of day' }]} />
          </Field>
          {config.mode === 'until_time' ? (
            <>
              <Field label="Time" htmlFor="wait-time">
                <Input id="wait-time" type="time" value={(config.until as { time?: string })?.time ?? '09:00'} disabled={disabled} onChange={(e) => set({ until: { ...(config.until as object), time: e.target.value } as never })} className="w-36 bg-surface" />
              </Field>
              <Field label="On" hint="No day selected: any day.">
                <WeekdayPicker value={(config.until as { days_of_week?: number[] })?.days_of_week ?? []} disabled={disabled} onChange={(days_of_week) => set({ until: { time: (config.until as { time?: string })?.time ?? '09:00', days_of_week } })} />
              </Field>
            </>
          ) : (
            <Field label="For">
              <DurationInput label="Wait" value={config.duration as never} onChange={(duration) => set({ duration })} disabled={disabled} />
            </Field>
          )}
          <Toggle label="Then wait for business hours" hint="Uses the working days and hours of the follow-up calendar." checked={!!config.business_hours} onChange={(business_hours) => set({ business_hours })} disabled={disabled} />
        </>
      )}

      {node.type === 'wait_for_event' && (
        <>
          <Field label="Wait until">
            <OptionSelect
              ariaLabel="Event to wait for"
              value={((config.events as string[]) ?? [])[0]}
              disabled={disabled}
              onChange={(key) => set({ events: [key as TriggerKey] })}
              options={WAITABLE_TRIGGERS.map((t) => ({ value: t.key, label: t.label }))}
            />
          </Field>
          <Field label="Only when">
            <ConditionBuilder
              value={config.filters as never}
              onChange={(filters) => set({ filters })}
              fields={conditionFields(triggerScope(((config.events as TriggerKey[]) ?? []).map((key) => ({ key }) as never)), catalog?.custom_fields ?? []).filter((f) => f.path.startsWith('trigger.'))}
              catalog={catalog}
              disabled={disabled}
              emptyLabel="Any time it happens."
            />
          </Field>
          <Field label="Give up after">
            <DurationInput label="Timeout" value={config.timeout as never} onChange={(timeout) => set({ timeout })} disabled={disabled} />
          </Field>
        </>
      )}

      {node.type === 'condition' && (
        <ConditionBuilder value={config.condition as never} onChange={(condition) => set({ condition })} fields={conditionFields(scope, catalog?.custom_fields ?? [])} catalog={catalog} disabled={disabled} />
      )}

      {node.type === 'end' && (
        <Field label="Note (shown in the run history)" htmlFor="end-reason">
          <Input id="end-reason" value={(config.reason as string) ?? ''} disabled={disabled} onChange={(e) => set({ reason: e.target.value })} className="bg-surface" />
        </Field>
      )}
    </div>
  );
}

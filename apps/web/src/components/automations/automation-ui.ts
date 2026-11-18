import {
  Bell,
  Bot,
  BotOff,
  CalendarClock,
  CircleStop,
  ClipboardList,
  Clock,
  Columns3,
  CreditCard,
  GitBranch,
  Hand,
  Hourglass,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  PhoneCall,
  Smartphone,
  Tag,
  Tags,
  UserCog,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import {
  CHANNEL_OPTIONS,
  CONTACT_FIELDS,
  CONVERSATION_FIELDS,
  NODE_CATALOG,
  OPERATOR_LABELS,
  TRIGGER_CATALOG,
  VARIABLES,
  findTrigger,
  type AutomationCategory,
  type AutomationFieldDef,
  type AutomationNode,
  type AutomationTrigger,
  type ConditionOperator,
  type NodeCategory,
  type NodeType,
  type TriggerCategory,
  type VariableDef,
  type VariableGroup,
} from '@crm/shared';

/** Presentation of automations: icons, labels and one-line summaries. */

export const NODE_ICONS: Record<NodeType, LucideIcon> = {
  send_message: MessageSquare,
  send_email: Mail,
  send_sms: Smartphone,
  send_to_ai: Bot,
  set_ai: BotOff,
  notify_team: Bell,
  create_task: ClipboardList,
  call: Phone,
  add_tag: Tag,
  remove_tag: Tags,
  update_contact: UserCog,
  move_stage: Columns3,
  wait: Clock,
  wait_for_event: Hourglass,
  condition: GitBranch,
  end: CircleStop,
};

export const NODE_CATEGORY_LABELS: Record<NodeCategory, string> = {
  messaging: 'Send',
  ai: 'AI agent',
  team: 'Team',
  contact: 'Contact',
  logic: 'Flow',
};

export const TRIGGER_CATEGORY_LABELS: Record<TriggerCategory, string> = {
  messages: 'Messages',
  conversations: 'Conversations',
  contacts: 'Contacts',
  appointments: 'Appointments',
  payments: 'Payments',
  calls: 'Calls',
  time: 'Time',
  manual: 'Manual',
};

export const TRIGGER_ICONS: Record<TriggerCategory, LucideIcon> = {
  messages: MessageCircle,
  conversations: MessageSquare,
  contacts: UserPlus,
  appointments: CalendarClock,
  payments: CreditCard,
  calls: PhoneCall,
  time: Clock,
  manual: Hand,
};

export const AUTOMATION_CATEGORY_LABELS: Record<AutomationCategory, string> = {
  ai: 'AI agent',
  booking: 'Booking messages',
  follow_up: 'Follow-ups',
  messaging: 'Messaging',
  custom: 'Your automations',
};

export const CHANNEL_STRATEGY_OPTIONS = [
  { value: 'auto', label: 'Automatic', hint: 'Their last channel, then the organization priority' },
  { value: 'same_channel', label: 'Same channel', hint: 'The channel they wrote from' },
  { value: 'whatsapp_only', label: 'WhatsApp', hint: 'Falls back to automatic if unavailable' },
  { value: 'sms_only', label: 'SMS', hint: 'Falls back to automatic if unavailable' },
  { value: 'email_only', label: 'Email', hint: 'Falls back to automatic if unavailable' },
] as const;

export const ROLE_OPTIONS = [
  { value: 'owner', label: 'Owners' },
  { value: 'admin', label: 'Admins' },
  { value: 'agent', label: 'Agents' },
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function triggerLabel(key: string): string {
  return findTrigger(key)?.label ?? key;
}

export function durationLabel(d: { amount: number; unit: string } | undefined): string {
  if (!d) return '';
  const unit = d.amount === 1 ? d.unit.replace(/s$/, '') : d.unit;
  return `${d.amount} ${unit}`;
}

function truncate(text: string | undefined, max = 60): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function recipientsLabel(node: AutomationNode): string {
  const r = (node.config as { recipients?: { mode: string } }).recipients;
  switch (r?.mode) {
    case 'filter':
      return 'Contacts matching a filter';
    case 'contacts':
      return 'Picked contacts';
    case 'team':
      return 'Team members';
    case 'custom':
      return 'A typed address';
    default:
      return '';
  }
}

/** One line describing what a step does, shown on its card. */
export function summarizeNode(node: AutomationNode): string {
  const c = node.config as unknown as Record<string, unknown>;
  const to = recipientsLabel(node);
  const withTo = (text: string) => (to ? `${to}: ${text}` : text);
  switch (node.type) {
    case 'send_message':
    case 'send_sms':
      return withTo(truncate(c.text as string) || 'No text yet');
    case 'send_email':
      return withTo(truncate((c.email as { subject?: string })?.subject) || 'No subject yet');
    case 'send_to_ai':
      return c.agent_id ? 'To the selected AI agent' : 'To the organization AI agent';
    case 'set_ai':
      return c.active ? 'Let the AI answer' : 'Stop the AI (the team answers)';
    case 'notify_team':
      return truncate(c.title as string) || 'No title yet';
    case 'create_task':
      return `${truncate(c.title as string) || 'No title yet'}${c.wait_until_done ? ' · waits until done' : ''}`;
    case 'call':
      return c.fallback_text ? 'Message instead if the call cannot start' : 'AI phone call';
    case 'add_tag':
    case 'remove_tag':
      return (c.tag as string) || 'No tag yet';
    case 'update_contact':
      return ((c.fields as Array<{ field: string }>) ?? []).map((f) => f.field.replace('custom.', '')).filter(Boolean).join(', ') || 'No field yet';
    case 'move_stage':
      return c.stage_id ? 'To the selected stage' : 'No stage yet';
    case 'wait': {
      const w = c as { mode?: string; duration?: { amount: number; unit: string }; until?: { time: string; days_of_week?: number[] }; business_hours?: boolean };
      const base =
        w.mode === 'until_time'
          ? `Until ${w.until?.time ?? '--:--'}${w.until?.days_of_week?.length ? ` on ${w.until.days_of_week.map((d) => WEEKDAYS[d]).join(', ')}` : ''}`
          : `${durationLabel(w.duration)}`;
      return `${base}${w.business_hours ? ' · business hours' : ''}`;
    }
    case 'wait_for_event': {
      const events = ((c.events as string[]) ?? []).map(triggerLabel).join(' or ');
      return `${events || 'No event'} · up to ${durationLabel(c.timeout as { amount: number; unit: string })}`;
    }
    case 'condition': {
      const group = c.condition as { any?: Array<{ all?: unknown[] }> };
      const count = group?.any?.reduce((n, b) => n + (b.all?.length ?? 0), 0) ?? 0;
      return count ? `${count} condition${count === 1 ? '' : 's'}` : 'No conditions yet';
    }
    case 'end':
      return (c.reason as string) || 'The automation ends here';
  }
}

export function summarizeTrigger(t: AutomationTrigger): string {
  if (t.key === 'schedule') {
    const s = t.schedule;
    if (!s) return 'On a schedule';
    switch (s.frequency) {
      case 'once':
        return `Once, on ${s.date ?? '…'} at ${s.time}`;
      case 'daily':
        return `Every day at ${s.time}`;
      case 'weekly':
        return `Every ${(s.days_of_week ?? []).map((d) => WEEKDAYS[d]).join(', ') || '…'} at ${s.time}`;
      case 'monthly':
        return `Every month on day ${s.day_of_month ?? '…'} at ${s.time}`;
    }
  }
  const filters = 'filters' in t && t.filters ? t.filters.any.reduce((n, b) => n + b.all.length, 0) : 0;
  return `${triggerLabel(t.key)}${filters ? ` · ${filters} filter${filters === 1 ? '' : 's'}` : ''}`;
}

// ── Fields, operators and variables available for a set of triggers ─────

export interface TriggerScope {
  organization: boolean;
  groups: Set<VariableGroup>;
  triggerFields: AutomationFieldDef[];
  hasConversation: boolean;
  isAppointment: boolean;
}

export function triggerScope(triggers: AutomationTrigger[]): TriggerScope {
  const entries = triggers.map((t) => findTrigger(t.key)).filter((e): e is NonNullable<typeof e> => !!e);
  const groups = new Set<VariableGroup>();
  const fields = new Map<string, AutomationFieldDef>();
  for (const e of entries) {
    e.variableGroups.forEach((g) => groups.add(g));
    e.fields.forEach((f) => fields.set(f.path, f));
  }
  return {
    organization: entries.some((e) => e.scope === 'organization'),
    groups,
    triggerFields: [...fields.values()],
    hasConversation: entries.length > 0 && entries.every((e) => e.variableGroups.includes('conversation')),
    isAppointment: entries.length > 0 && entries.every((e) => e.variableGroups.includes('appointment')),
  };
}

/** Fields a condition can use (trigger fields first, then contact and conversation). */
export function conditionFields(scope: TriggerScope, customFields: string[] = [], only: 'all' | 'contact' = 'all'): AutomationFieldDef[] {
  const custom: AutomationFieldDef[] = customFields.map((k) => ({ path: `contact.custom.${k}`, label: `Captured: ${k}`, type: 'string' }));
  if (only === 'contact') return [...CONTACT_FIELDS, ...custom];
  return [
    ...scope.triggerFields,
    ...(scope.groups.has('contact') ? [...CONTACT_FIELDS, ...custom] : []),
    ...(scope.groups.has('conversation') ? CONVERSATION_FIELDS : []),
  ];
}

const OPERATORS_BY_TYPE: Record<AutomationFieldDef['type'], ConditionOperator[]> = {
  string: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  text: ['contains', 'not_contains', 'matches_keywords', 'equals', 'is_empty', 'is_not_empty'],
  number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  boolean: ['is_true', 'is_false'],
  enum: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  date: ['older_than_days', 'newer_than_days', 'is_empty', 'is_not_empty'],
  tags: ['has_tag', 'not_has_tag', 'is_empty', 'is_not_empty'],
};

export function operatorsFor(field: AutomationFieldDef | undefined): Array<{ value: ConditionOperator; label: string }> {
  const ops = field ? OPERATORS_BY_TYPE[field.type] : OPERATORS_BY_TYPE.string;
  return ops.map((value) => ({ value, label: OPERATOR_LABELS[value] }));
}

export interface VariableOption extends VariableDef {
  group: string;
}

/** `{{variables}}` a step can use, given the triggers (and whether it is personalised per recipient). */
export function availableVariables(scope: TriggerScope, customFields: string[] = [], perRecipient = false): VariableOption[] {
  const groups = new Set(scope.groups);
  if (perRecipient) groups.add('contact');
  const out: VariableOption[] = [];
  for (const [group, vars] of Object.entries(VARIABLES) as Array<[VariableGroup, VariableDef[]]>) {
    if (groups.has(group)) vars.forEach((v) => out.push({ ...v, group: group[0].toUpperCase() + group.slice(1) }));
  }
  if (groups.has('contact')) {
    customFields.forEach((k) => out.push({ path: `contact.custom.${k}`, label: k, example: '', group: 'Captured data' }));
  }
  scope.triggerFields
    .filter((f) => f.type !== 'boolean')
    .forEach((f) => out.push({ path: f.path, label: f.label, example: '', group: 'Trigger' }));
  return out;
}

export const CHANNEL_LABELS = Object.fromEntries(CHANNEL_OPTIONS.map((c) => [c.value, c.label]));

/** Triggers a "wait for event" step can wait for (events about the contact). */
export const WAITABLE_TRIGGERS = TRIGGER_CATALOG.filter((t) => t.topic && t.scope === 'contact');

export function nodeLabel(node: AutomationNode): string {
  return node.label || NODE_CATALOG[node.type].label;
}

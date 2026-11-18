import {
  CONTACT_FIELDS,
  CONVERSATION_FIELDS,
  NODE_CATALOG,
  UNARY_OPERATORS,
  VARIABLES,
  findTrigger,
  isNodeType,
  type AutomationDefinition,
  type AutomationNode,
  type AutomationTrigger,
  type ConditionGroup,
  type ConditionOperator,
  type EmailContent,
  type NodeConfigMap,
  type NodeHandle,
  type RecipientConfig,
  type TriggerCatalogEntry,
  type ValidationIssue,
  type ValidationResult,
  type VariableGroup,
} from '@crm/shared';
import { templateVariables } from '../../../../infrastructure/messaging/template';
import { AudienceCompileError, compileAudience } from '../conditions/audience-sql.compiler';
import { nextOccurrence, parseTime } from '../time/automation-time';

/**
 * Checks an automation before it is published (and for the builder's error
 * list). Pure: organization data it needs (stages, users, AI connections) is
 * passed in.
 */
export interface ValidationContext {
  stageIds?: Set<string>;
  userIds?: Set<string>;
  aiConnectionIds?: Set<string>;
  /** The organization has an AI connection to send to. */
  hasAiConnection?: boolean;
  timezone?: string;
  now?: Date;
}

/** Flat keys kept for platform templates; always available. */
const FLAT_VARIABLES = new Set(['user_name', 'organization_name']);
const OPERATORS = new Set<ConditionOperator>([
  'equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'is_empty', 'is_not_empty', 'is_true', 'is_false',
  'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'has_tag', 'not_has_tag', 'matches_keywords', 'older_than_days', 'newer_than_days',
]);
const NODE_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_NODES = 200;
const MAX_TEXT = 5000;

/** What a set of triggers provides to the steps. */
interface TriggerScopeInfo {
  entries: TriggerCatalogEntry[];
  scope: 'contact' | 'organization' | 'mixed' | 'none';
  groups: Set<VariableGroup>;
  triggerFields: Set<string>;
  hasConversation: boolean;
  isAppointment: boolean;
}

function scopeOf(triggers: AutomationTrigger[]): TriggerScopeInfo {
  const entries = triggers.map((t) => findTrigger(t.key)).filter((t): t is TriggerCatalogEntry => !!t);
  const scopes = new Set(entries.map((e) => e.scope));
  const groups = new Set<VariableGroup>();
  const triggerFields = new Set<string>();
  for (const e of entries) {
    e.variableGroups.forEach((g) => groups.add(g));
    e.fields.forEach((f) => triggerFields.add(f.path));
  }
  return {
    entries,
    scope: scopes.size === 0 ? 'none' : scopes.size > 1 ? 'mixed' : [...scopes][0],
    groups,
    triggerFields,
    // Every trigger must provide a conversation for conversation steps.
    hasConversation: entries.length > 0 && entries.every((e) => e.variableGroups.includes('conversation')),
    isAppointment: entries.length > 0 && entries.every((e) => e.variableGroups.includes('appointment')),
  };
}

export function validateAutomation(def: AutomationDefinition, ctx: ValidationContext = {}): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add: Add = (message, node_key, path) => {
    issues.push({ message, node_key, path });
  };
  const triggers = Array.isArray(def?.triggers) ? def.triggers : [];
  const graph = def?.graph ?? { nodes: [], edges: [] };
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];

  // ── Triggers ──────────────────────────────────────────────────────────
  if (!triggers.length) add('Add a trigger: what starts this automation?', undefined, 'triggers');
  triggers.forEach((t, i): void => {
    const path = `triggers[${i}]`;
    const entry = findTrigger(t?.key);
    if (!entry) return add(`Unknown trigger "${t?.key}"`, undefined, path);
    if (t.key === 'schedule') {
      const spec = t.schedule;
      if (!spec) return add('Set when the schedule runs', undefined, `${path}.schedule`);
      if (parseTime(spec.time) === null) return add('Set a valid time (HH:MM)', undefined, `${path}.schedule.time`);
      if (spec.frequency === 'weekly' && !spec.days_of_week?.length) return add('Pick at least one day of the week', undefined, `${path}.schedule.days_of_week`);
      if (spec.frequency === 'monthly' && !(Number.isInteger(spec.day_of_month) && spec.day_of_month! >= 1 && spec.day_of_month! <= 31)) {
        return add('Pick a day of the month (1–31)', undefined, `${path}.schedule.day_of_month`);
      }
      if (!nextOccurrence(spec, spec.timezone || ctx.timezone || 'UTC', ctx.now ?? new Date())) {
        return add(spec.frequency === 'once' ? 'The date and time are in the past' : 'This schedule never runs', undefined, `${path}.schedule`);
      }
    }
    if ('filters' in t && t.filters) {
      validateCondition(t.filters, scopeOf([t]), add, undefined, `${path}.filters`);
    }
  });
  if (triggers.some((t) => t?.key === 'schedule') && triggers.length > 1) {
    add('A scheduled automation cannot have other triggers', undefined, 'triggers');
  }
  const info = scopeOf(triggers);

  // ── Settings ──────────────────────────────────────────────────────────
  const settings = def?.settings;
  if (!settings) add('Missing settings', undefined, 'settings');
  else {
    if (!['never', 'after_finish'].includes(settings.reentry)) add('Choose whether contacts can go through it again', undefined, 'settings.reentry');
    if (!['anytime', 'business_hours'].includes(settings.send_window)) add('Choose when messages may be sent', undefined, 'settings.send_window');
    (settings.exit_on ?? []).forEach((rule, i): void => {
      const entry = findTrigger(rule?.trigger);
      if (!entry || !entry.topic) return add(`Unknown exit event "${rule?.trigger}"`, undefined, `settings.exit_on[${i}]`);
      if (info.scope === 'organization') add('Scheduled automations have no contact to exit', undefined, `settings.exit_on[${i}]`);
      if (rule.filters) validateCondition(rule.filters, scopeOf([{ key: entry.key } as AutomationTrigger]), add, undefined, `settings.exit_on[${i}].filters`);
    });
  }

  // ── Graph structure ───────────────────────────────────────────────────
  if (nodes.length > MAX_NODES) add(`An automation can have at most ${MAX_NODES} steps`);
  const byKey = new Map<string, AutomationNode>();
  for (const node of nodes) {
    if (!node || typeof node.key !== 'string' || !NODE_KEY_RE.test(node.key)) {
      add('A step has an invalid key');
      continue;
    }
    if (byKey.has(node.key)) add('Two steps share the same key', node.key);
    byKey.set(node.key, node);
    if (!isNodeType(node.type)) add(`Unknown step type "${node.type}"`, node.key);
  }
  const incoming = new Map<string, number>();
  const usedHandles = new Set<string>();
  for (const edge of edges) {
    const source = byKey.get(edge?.source);
    if (!source || !byKey.has(edge?.target)) {
      add('A connection points to a step that does not exist');
      continue;
    }
    const handle: NodeHandle = edge.sourceHandle ?? 'next';
    if (isNodeType(source.type) && !NODE_CATALOG[source.type].handles.includes(handle)) {
      add(`"${NODE_CATALOG[source.type].label}" has no "${handle}" path`, source.key);
    }
    const handleKey = `${source.key}:${handle}`;
    if (usedHandles.has(handleKey)) add(`The "${handle}" path of this step goes to two steps`, source.key);
    usedHandles.add(handleKey);
    if (edge.source === edge.target) add('A step cannot lead to itself', source.key);
    incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1);
  }
  for (const [key, count] of incoming) {
    if (count > 1) add('Two paths lead to this step (paths cannot merge)', key);
  }
  const roots = [...byKey.keys()].filter((k) => !incoming.has(k));
  if (byKey.size > 0 && roots.length !== 1) {
    add(roots.length === 0 ? 'The steps form a loop' : 'Every step must be connected to the flow', roots[1] ?? roots[0]);
  }
  if (roots.length === 1) {
    const reached = new Set<string>();
    const stack = [roots[0]];
    while (stack.length) {
      const key = stack.pop()!;
      if (reached.has(key)) {
        add('The steps form a loop', key);
        break;
      }
      reached.add(key);
      edges.filter((e) => e.source === key && byKey.has(e.target)).forEach((e) => stack.push(e.target));
    }
    for (const key of byKey.keys()) if (!reached.has(key)) add('This step is not connected to the flow', key);
  }
  if (!nodes.length) add('Add at least one step', undefined, 'graph');

  // ── Steps ─────────────────────────────────────────────────────────────
  for (const node of byKey.values()) {
    if (!isNodeType(node.type)) continue;
    validateNode(node, info, ctx, add);
  }

  return { valid: issues.length === 0, issues };
}

type Add = (message: string, node_key?: string, path?: string) => void;

function validateNode(node: AutomationNode, info: TriggerScopeInfo, ctx: ValidationContext, add: Add): void {
  const entry = NODE_CATALOG[node.type];
  const k = node.key;
  const c = (node.config ?? {}) as unknown as Record<string, unknown>;

  if (entry.needsContact && info.scope === 'organization') {
    add(`"${entry.label}" needs a contact: it cannot be used in a scheduled automation`, k);
  }
  if (entry.needsConversation && info.scope !== 'organization' && !info.hasConversation) {
    add(`"${entry.label}" needs a conversation: use a message, conversation, payment or call trigger`, k);
  }

  const perRecipient = sendsToContacts((c as { recipients?: RecipientConfig }).recipients);
  const text = (path: string, value: unknown, label: string, required = true) => {
    if (typeof value !== 'string' || !value.trim()) {
      if (required) add(`${label} is required`, k, `config.${path}`);
      return;
    }
    if (value.length > MAX_TEXT) add(`${label} is too long (max ${MAX_TEXT} characters)`, k, `config.${path}`);
    checkVariables(value, info, add, k, `config.${path}`, perRecipient);
  };

  switch (node.type) {
    case 'send_message': {
      const cfg = c as unknown as NodeConfigMap['send_message'];
      validateRecipients(cfg.recipients, info, add, k, ['run_contact', 'filter', 'contacts']);
      text('text', cfg.text, 'Message text');
      break;
    }
    case 'send_sms': {
      const cfg = c as unknown as NodeConfigMap['send_sms'];
      // Team members have no phone number on file: SMS goes to contacts or a typed number.
      validateRecipients(cfg.recipients, info, add, k, ['run_contact', 'filter', 'contacts', 'custom']);
      text('text', cfg.text, 'SMS text');
      break;
    }
    case 'send_email': {
      const cfg = c as unknown as NodeConfigMap['send_email'];
      validateRecipients(cfg.recipients, info, add, k, ['run_contact', 'filter', 'contacts', 'team', 'custom']);
      validateEmail(cfg.email, info, add, k, perRecipient);
      if (cfg.calendar_invite && cfg.calendar_invite !== 'none') {
        if (!info.isAppointment) add('A calendar invite needs an appointment trigger', k, 'config.calendar_invite');
        if (cfg.recipients?.mode !== 'run_contact') add('A calendar invite can only be sent to the appointment contact', k, 'config.calendar_invite');
      }
      break;
    }
    case 'send_to_ai': {
      const cfg = c as unknown as NodeConfigMap['send_to_ai'];
      if (cfg.agent_id) {
        if (ctx.aiConnectionIds && !ctx.aiConnectionIds.has(cfg.agent_id)) add('This AI agent no longer exists', k, 'config.agent_id');
      } else if (ctx.hasAiConnection === false) {
        add('Connect an AI agent first (Settings → AI Agent)', k, 'config.agent_id');
      }
      break;
    }
    case 'set_ai':
      if (typeof (c as unknown as NodeConfigMap['set_ai']).active !== 'boolean') add('Choose on or off', k, 'config.active');
      break;
    case 'notify_team': {
      const cfg = c as unknown as NodeConfigMap['notify_team'];
      text('title', cfg.title, 'Title');
      text('description', cfg.description, 'Description', false);
      const emailTo = cfg.email_to;
      const emails = !!(emailTo && (emailTo.roles?.length || emailTo.user_ids?.length));
      if (!cfg.in_app && !emails) add('Choose how to notify: in the app, by email, or both', k);
      emailTo?.user_ids?.forEach((id) => {
        if (ctx.userIds && !ctx.userIds.has(id)) add('A selected team member no longer exists', k, 'config.email_to');
      });
      break;
    }
    case 'create_task': {
      const cfg = c as unknown as NodeConfigMap['create_task'];
      text('title', cfg.title, 'Task title');
      text('description', cfg.description, 'Description', false);
      break;
    }
    case 'call':
      text('fallback_text', (c as unknown as NodeConfigMap['call']).fallback_text, 'Fallback message', false);
      break;
    case 'add_tag':
    case 'remove_tag': {
      const tag = (c as unknown as NodeConfigMap['add_tag']).tag;
      if (typeof tag !== 'string' || !tag.trim()) add('Tag is required', k, 'config.tag');
      else if (tag.length > 100) add('Tag is too long', k, 'config.tag');
      break;
    }
    case 'update_contact': {
      const fields = (c as unknown as NodeConfigMap['update_contact']).fields;
      if (!Array.isArray(fields) || !fields.length) add('Add a field to update', k, 'config.fields');
      (fields ?? []).forEach((f, i) => {
        const allowed = ['first_name', 'last_name', 'email', 'phone'].includes(f?.field) || /^custom\.[a-zA-Z0-9_]{1,64}$/.test(f?.field ?? '');
        if (!allowed) add('Choose a contact field', k, `config.fields[${i}].field`);
        if (typeof f?.value === 'string') checkVariables(f.value, info, add, k, `config.fields[${i}].value`);
      });
      break;
    }
    case 'move_stage': {
      const stageId = (c as unknown as NodeConfigMap['move_stage']).stage_id;
      if (!stageId) add('Choose a stage', k, 'config.stage_id');
      else if (ctx.stageIds && !ctx.stageIds.has(stageId)) add('This stage no longer exists', k, 'config.stage_id');
      break;
    }
    case 'wait': {
      const cfg = c as unknown as NodeConfigMap['wait'];
      if (cfg.mode === 'duration') {
        if (!cfg.duration || !(Number(cfg.duration.amount) > 0) || !['minutes', 'hours', 'days'].includes(cfg.duration.unit)) {
          add('Set how long to wait', k, 'config.duration');
        } else if (cfg.duration.unit === 'days' && cfg.duration.amount > 365) add('Waits are limited to one year', k, 'config.duration');
      } else if (cfg.mode === 'until_time') {
        if (!cfg.until || parseTime(cfg.until.time) === null) add('Set the time to wait until (HH:MM)', k, 'config.until.time');
      } else add('Choose how to wait', k, 'config.mode');
      break;
    }
    case 'wait_for_event': {
      const cfg = c as unknown as NodeConfigMap['wait_for_event'];
      if (!Array.isArray(cfg.events) || !cfg.events.length) add('Choose the event to wait for', k, 'config.events');
      (cfg.events ?? []).forEach((key, i) => {
        const trig = findTrigger(key);
        if (!trig?.topic || trig.scope !== 'contact') add(`Cannot wait for "${key}"`, k, `config.events[${i}]`);
      });
      if (!cfg.timeout || !(Number(cfg.timeout.amount) > 0)) add('Set how long to wait before giving up', k, 'config.timeout');
      if (cfg.filters) {
        const waitInfo = scopeOf((cfg.events ?? []).map((key) => ({ key }) as AutomationTrigger));
        validateCondition(cfg.filters, { ...waitInfo, groups: new Set([...waitInfo.groups, ...info.groups]) }, add, k, 'config.filters');
      }
      break;
    }
    case 'condition': {
      const cfg = c as unknown as NodeConfigMap['condition'];
      if (!cfg.condition?.any?.some((b) => b.all?.length)) add('Add at least one condition', k, 'config.condition');
      else validateCondition(cfg.condition, info, add, k, 'config.condition');
      break;
    }
    case 'end':
      break;
  }
}

function validateRecipients(
  recipients: RecipientConfig | undefined,
  info: TriggerScopeInfo,
  add: Add,
  k: string,
  allowed: RecipientConfig['mode'][],
): void {
  if (!recipients || !allowed.includes(recipients.mode)) return add('Choose who receives it', k, 'config.recipients');
  switch (recipients.mode) {
    case 'run_contact':
      if (info.scope === 'organization') add('A scheduled automation has no contact: choose who receives it', k, 'config.recipients');
      break;
    case 'filter':
      try {
        compileAudience(recipients.filter);
      } catch (err) {
        if (err instanceof AudienceCompileError) add(err.message, k, 'config.recipients.filter');
        else throw err;
      }
      if (!recipients.filter?.any?.some((b) => b.all?.length)) {
        add('Add a condition to choose the contacts (or pick "everyone" explicitly)', k, 'config.recipients.filter');
      }
      break;
    case 'contacts':
      if (!recipients.contact_ids?.length) add('Pick at least one contact', k, 'config.recipients.contact_ids');
      break;
    case 'team':
      if (!recipients.team?.roles?.length && !recipients.team?.user_ids?.length) add('Pick team members or roles', k, 'config.recipients.team');
      break;
    case 'custom':
      if (!recipients.address?.trim()) add('Enter the phone number or email', k, 'config.recipients.address');
      else checkVariables(recipients.address, info, add, k, 'config.recipients.address');
      break;
  }
}

function validateEmail(email: EmailContent | undefined, info: TriggerScopeInfo, add: Add, k: string, perRecipient: boolean): void {
  if (!email) return add('Write the email', k, 'config.email');
  if (!email.subject?.trim()) add('Subject is required', k, 'config.email.subject');
  if (!email.paragraphs?.some((p) => p?.trim())) add('Write the email body', k, 'config.email.paragraphs');
  const strings: Array<[string, string | null | undefined]> = [
    ['subject', email.subject],
    ['heading', email.heading],
    ['greeting', email.greeting],
    ['footer', email.footer],
    ...(email.paragraphs ?? []).map((p, i) => [`paragraphs[${i}]`, p] as [string, string]),
    ...(email.notes ?? []).map((n, i) => [`notes[${i}]`, n] as [string, string]),
    ...(email.details ?? []).flatMap((d, i) => [[`details[${i}].label`, d.label], [`details[${i}].value`, d.value]] as Array<[string, string]>),
    ...(email.links ?? []).flatMap((l, i) => [[`links[${i}].label`, l.label], [`links[${i}].url`, l.url]] as Array<[string, string]>),
    ...(email.button ? ([['button.label', email.button.label], ['button.url', email.button.url]] as Array<[string, string]>) : []),
  ];
  for (const [path, value] of strings) {
    if (typeof value === 'string') checkVariables(value, info, add, k, `config.email.${path}`, perRecipient);
  }
}

/** Is `{{path}}` something this automation's runs can fill? */
function knownVariable(path: string, groups: Set<VariableGroup>, info: TriggerScopeInfo): boolean {
  if (FLAT_VARIABLES.has(path)) return true;
  if (path.startsWith('trigger.')) return info.triggerFields.has(path);
  if (path.startsWith('contact.custom.')) return groups.has('contact');
  return Object.entries(VARIABLES).some(([group, vars]) => groups.has(group as VariableGroup) && vars.some((v) => v.path === path));
}

/**
 * `perRecipient`: a message sent to several contacts (a filter or picked
 * contacts) is personalised for each one, so `contact.*` is available even
 * without a run contact.
 */
function checkVariables(value: string, info: TriggerScopeInfo, add: Add, k: string, path: string, perRecipient = false): void {
  const groups = perRecipient ? new Set<VariableGroup>([...info.groups, 'contact']) : info.groups;
  for (const variable of templateVariables(value)) {
    if (!knownVariable(variable, groups, info)) {
      add(`{{${variable}}} is not available for this trigger`, k, path);
    }
  }
}

function sendsToContacts(recipients: RecipientConfig | undefined): boolean {
  return recipients?.mode === 'filter' || recipients?.mode === 'contacts';
}

/** Fields a condition may use, given the triggers. */
function conditionFields(info: TriggerScopeInfo): Set<string> {
  const fields = new Set<string>(info.triggerFields);
  if (info.groups.has('contact')) CONTACT_FIELDS.forEach((f) => fields.add(f.path));
  if (info.groups.has('conversation')) CONVERSATION_FIELDS.forEach((f) => fields.add(f.path));
  return fields;
}

function validateCondition(group: ConditionGroup, info: TriggerScopeInfo, add: Add, k: string | undefined, path: string): void {
  const fields = conditionFields(info);
  group.any?.forEach((block, bi) =>
    block.all?.forEach((rule, ri): void => {
      const rulePath = `${path}.any[${bi}].all[${ri}]`;
      const custom = rule?.field?.startsWith('contact.custom.') && info.groups.has('contact');
      if (!rule?.field || (!fields.has(rule.field) && !custom)) {
        return add(`"${rule?.field ?? ''}" cannot be used here`, k, rulePath);
      }
      if (!OPERATORS.has(rule.operator)) return add(`Unknown comparison "${rule.operator}"`, k, rulePath);
      if (!UNARY_OPERATORS.includes(rule.operator)) {
        const v = rule.value;
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) add('Enter a value to compare with', k, rulePath);
      }
    }),
  );
}

import type { ConditionGroup, ConditionOperator, ConditionRule, ConditionValue } from '@crm/shared';
import { isEmptyCondition } from '@crm/shared';

/**
 * Compiles a contact filter (a condition group over `contact.*` fields) into
 * a SQL predicate on `clients.contacts` aliased `c`, for the "contacts
 * matching a filter" recipients of a step.
 *
 * Mirrors condition-evaluator.ts exactly for the fields it accepts (the DB
 * parity test checks both on the same contacts): case-insensitive text, list
 * membership for tags/channels, loose booleans, and a missing value never
 * satisfying a comparison. Anything else is rejected, so the builder can tell
 * the user before publishing.
 */
export class AudienceCompileError extends Error {}

export interface CompiledAudience {
  sql: string;
  params: Record<string, unknown>;
}

type FieldKind = 'text' | 'tags' | 'enum' | 'number' | 'date' | 'channels' | 'custom';

const FIELDS: Record<string, { kind: FieldKind; column: string }> = {
  'contact.first_name': { kind: 'text', column: 'c.first_name' },
  'contact.last_name': { kind: 'text', column: 'c.last_name' },
  'contact.email': { kind: 'text', column: 'c.email' },
  'contact.phone': { kind: 'text', column: 'c.phone' },
  'contact.tags': { kind: 'tags', column: 'c.tags' },
  'contact.stage': { kind: 'enum', column: 'c.lead_stage' },
  'contact.handled_by': { kind: 'enum', column: 'c.handled_by' },
  'contact.assigned_to': { kind: 'enum', column: 'c.assigned_to::text' },
  'contact.status': { kind: 'enum', column: 'c.status' },
  'contact.lead_score': { kind: 'number', column: 'c.lead_score' },
  'contact.created_at': { kind: 'date', column: 'c.created_at' },
  'contact.last_contacted_at': { kind: 'date', column: 'c.last_contacted_at' },
  'contact.channels': { kind: 'channels', column: '' },
};

const OPERATORS: Record<FieldKind, ConditionOperator[]> = {
  text: ['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'is_empty', 'is_not_empty', 'in', 'not_in'],
  enum: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  tags: ['has_tag', 'not_has_tag', 'equals', 'not_equals', 'contains', 'not_contains', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  number: ['equals', 'not_equals', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  date: ['older_than_days', 'newer_than_days', 'gt', 'gte', 'lt', 'lte', 'is_empty', 'is_not_empty'],
  channels: ['equals', 'not_equals', 'in', 'not_in', 'is_empty', 'is_not_empty'],
  custom: [
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'starts_with',
    'is_empty',
    'is_not_empty',
    'is_true',
    'is_false',
    'in',
    'not_in',
    'gt',
    'gte',
    'lt',
    'lte',
  ],
};

const CUSTOM_PREFIX = 'contact.custom.';
const NUMERIC = `'^\\s*-?[0-9]+(\\.[0-9]+)?\\s*$'`;

class Builder {
  readonly params: Record<string, unknown> = {};
  private n = 0;

  constructor(private readonly now: Date) {}

  param(value: unknown): string {
    const name = `aud_${this.n++}`;
    this.params[name] = value;
    return `:${name}`;
  }

  nowParam(): string {
    return `${this.param(this.now.toISOString())}::timestamptz`;
  }
}

function list(value: ConditionValue | undefined): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null || value === undefined || value === '') return [];
  return String(value)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function requireValue(rule: ConditionRule): void {
  if (rule.value === undefined || rule.value === null || rule.value === '') {
    throw new AudienceCompileError(`"${rule.field}" needs a value to compare with`);
  }
}

/**
 * Text-like column (text, enum, or a captured field read with ->>). For a
 * captured field, `jsonField` is the raw jsonb value: a stored yes/no matches
 * the words yes/no too, as in the evaluator.
 */
function textRule(col: string, rule: ConditionRule, b: Builder, allowOrdering = false, jsonField?: string): string {
  const empty = `(${col} IS NULL OR ${col} = '')`;
  switch (rule.operator) {
    case 'is_empty':
      return empty;
    case 'is_not_empty':
      return `NOT ${empty}`;
    case 'is_true':
      return `COALESCE(lower(trim(${col})) IN ('true', 'yes'), false)`;
    case 'is_false':
      return `NOT COALESCE(lower(trim(${col})) IN ('true', 'yes'), false)`;
    case 'equals':
    case 'not_equals': {
      if (rule.value === null || rule.value === undefined) {
        return rule.operator === 'equals' ? empty : `NOT ${empty}`;
      }
      let match: string;
      if (typeof rule.value === 'boolean') {
        const truthy = `COALESCE(lower(trim(${col})) IN ('true', 'yes'), false)`;
        match = rule.value ? truthy : `(${col} IS NOT NULL AND NOT ${truthy})`;
      } else if (typeof rule.value === 'number') {
        match = `(${col} ~ ${NUMERIC} AND (${col})::numeric = ${b.param(rule.value)})`;
      } else {
        const text = String(rule.value).trim().toLowerCase();
        match = `COALESCE(lower(trim(${col})) = ${b.param(text)}, false)`;
        if (jsonField && (text === 'yes' || text === 'no')) {
          match = `(${match} OR COALESCE(jsonb_typeof(${jsonField}) = 'boolean' AND (${jsonField})::boolean = ${text === 'yes'}, false))`;
        }
      }
      return rule.operator === 'equals' ? match : `NOT ${match}`;
    }
    case 'contains':
    case 'not_contains': {
      requireValue(rule);
      const match = `COALESCE(${col} ILIKE ${b.param(`%${likeEscape(String(rule.value).trim())}%`)}, false)`;
      return rule.operator === 'contains' ? match : `NOT ${match}`;
    }
    case 'starts_with':
      requireValue(rule);
      return `COALESCE(trim(${col}) ILIKE ${b.param(`${likeEscape(String(rule.value).trim())}%`)}, false)`;
    case 'in':
    case 'not_in': {
      const values = list(rule.value).map((v) => v.toLowerCase());
      const match = values.length ? `COALESCE(lower(trim(${col})) = ANY(${b.param(values)}::text[]), false)` : 'false';
      return rule.operator === 'in' ? match : `NOT ${match}`;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (!allowOrdering) break;
      const v = Number(rule.value);
      if (!Number.isFinite(v)) throw new AudienceCompileError(`"${rule.field}" can only be compared with a number`);
      const op = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[rule.operator];
      return `(${col} ~ ${NUMERIC} AND (${col})::numeric ${op} ${b.param(v)})`;
    }
  }
  throw new AudienceCompileError(`"${rule.operator}" cannot be used with "${rule.field}"`);
}

function tagsRule(rule: ConditionRule, b: Builder): string {
  const anyTag = (values: string[]) =>
    `EXISTS (SELECT 1 FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(tag) WHERE lower(trim(t.tag)) = ANY(${b.param(values)}::text[]))`;
  switch (rule.operator) {
    case 'is_empty':
      return `COALESCE(cardinality(c.tags), 0) = 0`;
    case 'is_not_empty':
      return `COALESCE(cardinality(c.tags), 0) > 0`;
    case 'has_tag':
    case 'equals':
    case 'contains':
      requireValue(rule);
      return anyTag([String(rule.value).trim().toLowerCase()]);
    case 'not_has_tag':
    case 'not_equals':
    case 'not_contains':
      requireValue(rule);
      return `NOT ${anyTag([String(rule.value).trim().toLowerCase()])}`;
    case 'in':
    case 'not_in': {
      const values = list(rule.value).map((v) => v.toLowerCase());
      const match = values.length ? anyTag(values) : 'false';
      return rule.operator === 'in' ? match : `NOT ${match}`;
    }
  }
  throw new AudienceCompileError(`"${rule.operator}" cannot be used with tags`);
}

/** Same rule as contactView().channels. */
function channelPredicate(channel: string, b: Builder): string {
  const p = b.param(channel);
  return `(COALESCE(c.channel_ids ->> ${p}, '') <> ''
    OR (${p} IN ('sms', 'voice') AND COALESCE(c.phone, '') <> '')
    OR (${p} = 'email' AND COALESCE(c.email, '') <> ''))`;
}

function channelsRule(rule: ConditionRule, b: Builder): string {
  const anyOf = (values: string[]) => (values.length ? `(${values.map((v) => channelPredicate(v, b)).join(' OR ')})` : 'false');
  const none = `(COALESCE(c.phone, '') = '' AND COALESCE(c.email, '') = ''
    AND NOT EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(c.channel_ids, '{}'::jsonb)) AS ch(k, v) WHERE ch.v <> ''))`;
  switch (rule.operator) {
    case 'is_empty':
      return none;
    case 'is_not_empty':
      return `NOT ${none}`;
    case 'equals':
      requireValue(rule);
      return anyOf([String(rule.value).trim().toLowerCase()]);
    case 'not_equals':
      requireValue(rule);
      return `NOT ${anyOf([String(rule.value).trim().toLowerCase()])}`;
    case 'in':
      return anyOf(list(rule.value).map((v) => v.toLowerCase()));
    case 'not_in':
      return `NOT ${anyOf(list(rule.value).map((v) => v.toLowerCase()))}`;
  }
  throw new AudienceCompileError(`"${rule.operator}" cannot be used with channels`);
}

function numberRule(col: string, rule: ConditionRule, b: Builder): string {
  if (rule.operator === 'is_empty') return `${col} IS NULL`;
  if (rule.operator === 'is_not_empty') return `${col} IS NOT NULL`;
  const v = Number(rule.value);
  if (!Number.isFinite(v)) throw new AudienceCompileError(`"${rule.field}" can only be compared with a number`);
  const op = { equals: '=', not_equals: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[rule.operator as string];
  if (!op) throw new AudienceCompileError(`"${rule.operator}" cannot be used with "${rule.field}"`);
  if (rule.operator === 'not_equals') return `(${col} IS NULL OR ${col} <> ${b.param(v)})`;
  return `COALESCE(${col} ${op} ${b.param(v)}, false)`;
}

function dateRule(col: string, rule: ConditionRule, b: Builder): string {
  switch (rule.operator) {
    case 'is_empty':
      return `${col} IS NULL`;
    case 'is_not_empty':
      return `${col} IS NOT NULL`;
    case 'older_than_days':
    case 'newer_than_days': {
      const days = Number(rule.value);
      if (!Number.isFinite(days)) throw new AudienceCompileError(`"${rule.field}" needs a number of days`);
      const since = `(${b.nowParam()} - make_interval(secs => ${b.param(days * 86400)}))`;
      return rule.operator === 'older_than_days'
        ? `COALESCE(${col} < ${since}, false)`
        : `COALESCE(${col} >= ${since}, false)`;
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const date = new Date(String(rule.value ?? ''));
      if (Number.isNaN(date.getTime())) throw new AudienceCompileError(`"${rule.field}" can only be compared with a date`);
      const op = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[rule.operator];
      return `COALESCE(${col} ${op} ${b.param(date.toISOString())}::timestamptz, false)`;
    }
  }
  throw new AudienceCompileError(`"${rule.operator}" cannot be used with "${rule.field}"`);
}

function compileRule(rule: ConditionRule, b: Builder): string {
  if (rule.field.startsWith(CUSTOM_PREFIX)) {
    const key = rule.field.slice(CUSTOM_PREFIX.length);
    if (!key || key.includes('.')) throw new AudienceCompileError(`"${rule.field}" is not a captured field`);
    if (!OPERATORS.custom.includes(rule.operator)) {
      throw new AudienceCompileError(`"${rule.operator}" cannot be used with "${rule.field}"`);
    }
    const k = b.param(key);
    return textRule(`(c.custom_fields ->> ${k})`, rule, b, true, `(c.custom_fields -> ${k})`);
  }
  const field = FIELDS[rule.field];
  if (!field) throw new AudienceCompileError(`"${rule.field}" cannot be used to choose recipients`);
  if (!OPERATORS[field.kind].includes(rule.operator)) {
    throw new AudienceCompileError(`"${rule.operator}" cannot be used with "${rule.field}"`);
  }
  switch (field.kind) {
    case 'text':
    case 'enum':
      return textRule(field.column, rule, b);
    case 'tags':
      return tagsRule(rule, b);
    case 'channels':
      return channelsRule(rule, b);
    case 'number':
      return numberRule(field.column, rule, b);
    case 'date':
      return dateRule(field.column, rule, b);
    default:
      throw new AudienceCompileError(`"${rule.field}" cannot be used to choose recipients`);
  }
}

export function compileAudience(group: ConditionGroup | null | undefined, now = new Date()): CompiledAudience {
  const b = new Builder(now);
  if (isEmptyCondition(group)) return { sql: 'TRUE', params: {} };
  const blocks = group!.any
    .filter((block) => block.all?.length)
    .map((block) => `(${block.all.map((rule) => `(${compileRule(rule, b)})`).join(' AND ')})`);
  return { sql: blocks.length ? `(${blocks.join(' OR ')})` : 'TRUE', params: b.params };
}

/** The fields a contact filter may use (for validation messages and the builder). */
export const AUDIENCE_FIELDS = Object.keys(FIELDS);
